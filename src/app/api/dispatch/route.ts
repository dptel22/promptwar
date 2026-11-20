/**
 * `POST /api/dispatch` - recovery dispatch for the active airport closures.
 *
 * The cascade engine and recovery evaluator ALWAYS run deterministically. When an
 * LLM is configured it only writes the prose briefing, and that prose is accepted
 * solely if `verifyAiBriefing` finds every number/ID grounded in the simulation.
 * Otherwise (no key, timeout, or hallucination) the deterministic briefing is
 * returned, so the response is correct with or without AI.
 */

import { NextResponse } from "next/server";
import { generateText, Output } from "ai";
import { z } from "zod";
import { readJsonBody, resolveAiModel } from "@/lib/ai/server-helpers";
import { predictCascadeRisk } from "@/lib/ml/predict";
import { CLOSURE_MAX, CLOSURE_MIN, VALID_IATA, formatHHMM } from "@/lib/sim/constants";
import { buildDeterministicBriefing, evaluateRecoveryCandidates } from "@/lib/sim/recovery";
import type {
  DispatcherBriefing,
  RecoveryAction,
  RecoveryEvaluation,
} from "@/lib/sim/types";
import { verifyAiBriefing } from "@/lib/sim/verify-ai";

/** Live crisis dispatches must never be stored by shared proxies or CDNs. */
const NO_STORE = { "Cache-Control": "no-store" } as const;

const AI_TIMEOUT_MS = 8000;

const ClosureSchema = z
  .object({
    id: z.string().min(1).max(80),
    airportId: z.enum(VALID_IATA),
    startMin: z.number().int().min(CLOSURE_MIN).max(CLOSURE_MAX - 1),
    endMin: z.number().int().min(CLOSURE_MIN + 1).max(CLOSURE_MAX),
    label: z.string().max(80).optional(),
  })
  .refine((c) => c.endMin > c.startMin, "endMin must exceed startMin");

const RecoveryActionSchema = z.discriminatedUnion("type", [
  z.object({
    id: z.string().min(1).max(80),
    type: z.literal("SWAP_SPARE"),
    spareTailId: z.string().min(1).max(80),
    targetFlightId: z.string().min(1).max(80),
    label: z.string().min(1).max(80),
  }),
  z.object({
    id: z.string().min(1).max(80),
    type: z.literal("CANCEL_FLIGHT"),
    flightIds: z.array(z.string().min(1).max(20)).min(1).max(4),
    label: z.string().min(1).max(80),
  }),
  z.object({
    id: z.string().min(1).max(80),
    type: z.literal("HOLD_CONNECTION"),
    connectionId: z.string().min(1).max(80),
    flightId: z.string().min(1).max(80),
    holdMinutes: z.number().int().min(1).max(45),
    label: z.string().min(1).max(80),
  }),
]);

const DispatchRequestSchema = z.object({
  closures: z.array(ClosureSchema).max(6),
  activeActions: z.array(RecoveryActionSchema).max(6).optional(),
});

const AiBriefingSchema = z.object({
  recommendedCandidateId: z.string().nullable(),
  executiveSummary: z.string().max(450),
  tradeoffAnalysis: z.string().max(450),
  optionNotes: z.array(
    z.object({
      candidateId: z.string(),
      rationale: z.string().max(260),
      tradeoff: z.string().max(260),
    })
  ),
});

/**
 * Standing instructions live in `system` so the data blob in `prompt` cannot
 * override them (prompt-injection hygiene).
 */
const SYSTEM_PROMPT = `You are an Airline Operations Control Center (OCC) AI Dispatcher for Domino Sky.
STRICT ZERO-HALLUCINATION CONTRACT:
1. Recommend ONLY a candidateId present in verifiedCandidates.
2. NEVER compute, round, estimate, or invent any number, flight ID, tail ID, crew ID, or connection ID.
3. Every single integer, flight ID (DSxxxx), tail ID (VT-DSxx), and connection ID (CXxx) you write MUST appear verbatim in the JSON provided by the user message.
4. Keep executiveSummary, tradeoffAnalysis, and optionNotes concise, operational, and specific to the active closures.`;

type DispatchMode = "ai_verified" | "deterministic_engine";

function respond(
  evaluation: RecoveryEvaluation,
  briefing: DispatcherBriefing,
  mlRisk: ReturnType<typeof predictCascadeRisk>,
  mode: DispatchMode,
  extra: Record<string, unknown> = {}
): NextResponse {
  return NextResponse.json(
    { evaluation, briefing, mlRisk, mode, ...extra },
    { headers: NO_STORE }
  );
}

function fail(error: string, status: number, details?: unknown): NextResponse {
  return NextResponse.json({ error, details }, { status, headers: NO_STORE });
}

/** Compact, fully simulated facts that the LLM may quote verbatim. */
function buildGroundedPayload(evaluation: RecoveryEvaluation) {
  const m = evaluation.baseline.metrics;
  return {
    closures: evaluation.closures.map((c) => ({
      airportId: c.airportId,
      window: `${formatHHMM(c.startMin)}-${formatHHMM(c.endMin)}`,
      durationMin: c.endMin - c.startMin,
    })),
    baselineMetrics: {
      delayedFlights: m.delayedFlights,
      crewBreaches: m.crewBreaches,
      totalDelayMinutes: m.totalDelayMinutes,
      brokenConnections: m.brokenConnections,
      groundedPax: m.groundedPax,
      missedConnectionPax: m.missedConnectionPax,
      totalStrandedPax: m.totalStrandedPax,
    },
    disruptedFlightsSample: evaluation.baseline.flights
      .filter((f) => f.status !== "ON_TIME")
      .slice(0, 12)
      .map((f) => ({
        flightId: f.flight_id,
        tailId: f.activeTailId,
        route: `${f.origin}->${f.destination}`,
        status: f.status,
        delayMin: f.delayMin,
        pax: f.pax,
        reason: f.primaryReason,
      })),
    brokenConnections: evaluation.baseline.connections
      .filter((c) => c.status !== "INTACT")
      .map((c) => ({
        connectionId: c.connection_id,
        airport: c.airport,
        fromFlight: c.from_flight,
        toFlight: c.to_flight,
        passengers: c.passengers,
        shortfallMin: c.shortfallMin,
      })),
    verifiedCandidates: evaluation.candidates.map((c) => ({
      candidateId: c.id,
      title: c.title,
      category: c.category,
      afterMetrics: {
        delayedFlights: c.result.metrics.delayedFlights,
        crewBreaches: c.result.metrics.crewBreaches,
        cancelledFlights: c.result.metrics.cancelledFlights,
        totalDelayMinutes: c.result.metrics.totalDelayMinutes,
        totalStrandedPax: c.result.metrics.totalStrandedPax,
      },
      deltas: c.deltas,
    })),
  };
}

/**
 * Asks the LLM for a briefing and enforces the allow-list verifier on the result.
 * Any failure (timeout, bad schema, hallucination) degrades to the deterministic
 * briefing instead of surfacing an error, so the UI always gets a safe answer.
 */
async function resolveBriefing(
  model: NonNullable<ReturnType<typeof resolveAiModel>>,
  evaluation: RecoveryEvaluation,
  fallback: DispatcherBriefing
): Promise<{ briefing: DispatcherBriefing; mode: DispatchMode; extra: Record<string, unknown> }> {
  const degraded = { briefing: fallback, mode: "deterministic_engine" as const };
  try {
    const { output } = await generateText({
      model,
      output: Output.object({ schema: AiBriefingSchema }),
      abortSignal: AbortSignal.timeout(AI_TIMEOUT_MS),
      system: SYSTEM_PROMPT,
      prompt: `VERIFIED_SIMULATION_JSON:\n${JSON.stringify(buildGroundedPayload(evaluation))}`,
    });

    const check = verifyAiBriefing(output, evaluation);
    if (check.valid) return { briefing: output, mode: "ai_verified", extra: {} };
    return {
      ...degraded,
      extra: { verificationFallback: true, rejectedViolations: check.violations },
    };
  } catch {
    return { ...degraded, extra: {} };
  }
}

/**
 * Evaluates recovery candidates for the posted closures and returns a briefing.
 *
 * @param req - JSON body `{ closures, activeActions? }` (max 32 KiB).
 * @returns Evaluation, briefing, ML cascade risk and the resolution `mode`.
 */
export async function POST(req: Request): Promise<NextResponse> {
  try {
    const body = await readJsonBody(req);
    if (!body.ok) return fail(body.error, body.status);

    const parsed = DispatchRequestSchema.safeParse(body.data);
    if (!parsed.success) return fail("Invalid closure payload", 400, parsed.error.flatten());

    const { closures } = parsed.data;
    // Schema-validated above; the cast only narrows zod's output to the domain union.
    const activeActions = (parsed.data.activeActions ?? []) as RecoveryAction[];
    const evaluation = evaluateRecoveryCandidates(closures, 5, activeActions);
    const mlRisk = predictCascadeRisk(closures, evaluation.baseline);
    const deterministic = buildDeterministicBriefing(evaluation);

    const model = resolveAiModel();
    if (!model || closures.length === 0 || evaluation.candidates.length === 0) {
      return respond(evaluation, deterministic, mlRisk, "deterministic_engine");
    }

    const resolved = await resolveBriefing(model, evaluation, deterministic);
    return respond(evaluation, resolved.briefing, mlRisk, resolved.mode, resolved.extra);
  } catch {
    return fail("Failed to evaluate recovery dispatch", 500);
  }
}
