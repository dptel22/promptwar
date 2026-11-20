import { NextResponse } from "next/server";
import { generateText, Output } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { predictCascadeRisk } from "@/lib/ml/predict";
import { DATASET, formatHHMM } from "@/lib/sim/engine";
import {
  buildDeterministicBriefing,
  evaluateRecoveryCandidates,
} from "@/lib/sim/recovery";
import type { RecoveryAction } from "@/lib/sim/types";
import { verifyAiBriefing } from "@/lib/sim/verify-ai";

const VALID_IATA = DATASET.airports.map((a) => a.id) as [string, ...string[]];

const ClosureSchema = z
  .object({
    id: z.string().min(1).max(80),
    airportId: z.enum(VALID_IATA),
    startMin: z.number().int().min(300).max(1379),
    endMin: z.number().int().min(301).max(1380),
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

function resolveModel() {
  if (process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN) {
    return "google/gemini-2.5-flash";
  }
  if (
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY
  ) {
    return google("gemini-2.5-flash");
  }
  return null;
}

export async function POST(req: Request) {
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON payload" },
        { status: 400 }
      );
    }

    const parsed = DispatchRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid closure payload", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const activeActions = (parsed.data.activeActions ?? []) as RecoveryAction[];
    const evaluation = evaluateRecoveryCandidates(
      parsed.data.closures,
      5,
      activeActions
    );
    const mlRisk = predictCascadeRisk(parsed.data.closures, evaluation.baseline);
    const deterministicBriefing = buildDeterministicBriefing(evaluation);

    if (
      parsed.data.closures.length === 0 ||
      evaluation.candidates.length === 0
    ) {
      return NextResponse.json({
        evaluation,
        briefing: deterministicBriefing,
        mlRisk,
        mode: "deterministic_engine",
      });
    }

    const model = resolveModel();
    if (!model) {
      return NextResponse.json({
        evaluation,
        briefing: deterministicBriefing,
        mlRisk,
        mode: "deterministic_engine",
      });
    }

    const m = evaluation.baseline.metrics;
    const groundedPayload = {
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

    try {
      const { output } = await generateText({
        model,
        output: Output.object({ schema: AiBriefingSchema }),
        abortSignal: AbortSignal.timeout(8000),
        prompt: `You are an Airline Operations Control Center (OCC) AI Dispatcher for Domino Sky.
STRICT ZERO-HALLUCINATION CONTRACT:
1. Recommend ONLY a candidateId present in verifiedCandidates.
2. NEVER compute, round, estimate, or invent any number, flight ID, tail ID, crew ID, or connection ID.
3. Every single integer, flight ID (DSxxxx), tail ID (VT-DSxx), and connection ID (CXxx) you write MUST appear verbatim in the JSON below.
4. Keep executiveSummary, tradeoffAnalysis, and optionNotes concise, operational, and specific to the active closures.

VERIFIED_SIMULATION_JSON:
${JSON.stringify(groundedPayload)}`,
      });

      const check = verifyAiBriefing(output, evaluation);
      if (check.valid) {
        return NextResponse.json({
          evaluation,
          briefing: output,
          mlRisk,
          mode: "ai_verified",
        });
      }

      return NextResponse.json({
        evaluation,
        briefing: deterministicBriefing,
        mlRisk,
        mode: "deterministic_engine",
        verificationFallback: true,
        rejectedViolations: check.violations,
      });
    } catch {
      return NextResponse.json({
        evaluation,
        briefing: deterministicBriefing,
        mlRisk,
        mode: "deterministic_engine",
      });
    }
  } catch {
    return NextResponse.json(
      { error: "Failed to evaluate recovery dispatch" },
      { status: 500 }
    );
  }
}
