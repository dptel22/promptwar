import { NextResponse } from "next/server";
import { generateText, Output } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { formatHHMM } from "@/lib/sim/engine";
import {
  buildDeterministicBriefing,
  evaluateRecoveryCandidates,
} from "@/lib/sim/recovery";
import { verifyAiBriefing } from "@/lib/sim/verify-ai";

const ClosureSchema = z.object({
  id: z.string(),
  airportId: z.string().length(3),
  startMin: z.number().int().min(300).max(1380),
  endMin: z.number().int().min(301).max(1380),
  label: z.string().optional(),
});

const DispatchRequestSchema = z.object({
  closures: z.array(ClosureSchema).max(6),
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
    const body = await req.json();
    const parsed = DispatchRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid closure payload", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const evaluation = evaluateRecoveryCandidates(parsed.data.closures, 5);
    const deterministicBriefing = buildDeterministicBriefing(evaluation);

    if (
      parsed.data.closures.length === 0 ||
      evaluation.candidates.length === 0
    ) {
      return NextResponse.json({
        evaluation,
        briefing: deterministicBriefing,
        mode: "deterministic_engine",
      });
    }

    const model = resolveModel();
    if (!model) {
      return NextResponse.json({
        evaluation,
        briefing: deterministicBriefing,
        mode: "deterministic_engine",
      });
    }

    // Build compact verified payload so the LLM cannot invent unverified metrics
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
          mode: "ai_verified",
        });
      }

      return NextResponse.json({
        evaluation,
        briefing: deterministicBriefing,
        mode: "deterministic_engine",
        verificationFallback: true,
        rejectedViolations: check.violations,
      });
    } catch {
      return NextResponse.json({
        evaluation,
        briefing: deterministicBriefing,
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
