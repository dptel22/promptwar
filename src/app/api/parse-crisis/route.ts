import { NextResponse } from "next/server";
import { generateText, Output } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { DATASET, formatHHMM } from "@/lib/sim/engine";
import { parseCrisisDeterministic } from "@/lib/sim/parse-crisis";
import type { AirportClosure } from "@/lib/sim/types";

const VALID_IATA = DATASET.airports.map((a) => a.id) as [string, ...string[]];

const ParseRequestSchema = z.object({
  prompt: z.string().min(2).max(500),
});

const CrisisOutputSchema = z.object({
  closures: z
    .array(
      z.object({
        airportId: z.enum(VALID_IATA),
        startMin: z.number().int().min(300).max(1350),
        endMin: z.number().int().min(315).max(1380),
        reasonLabel: z.string().max(40),
      })
    )
    .max(5),
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
    const parsed = ParseRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Provide a crisis description (2-500 chars)." },
        { status: 400 }
      );
    }

    const model = resolveModel();
    if (model) {
      try {
        const airportGuide = DATASET.airports
          .map((a) => `${a.id}:${a.city}`)
          .join(", ");

        const { output } = await generateText({
          model,
          output: Output.object({ schema: CrisisOutputSchema }),
          abortSignal: AbortSignal.timeout(6000),
          prompt: `Convert this plain-English Indian airport disruption request into structured airport closure time windows in minutes since 00:00 IST (e.g. 08:00 = 480, 09:30 = 570, 12:00 = 720).
Valid airports: ${airportGuide}.
Ensure endMin > startMin for every closure.
Request: "${parsed.data.prompt}"`,
        });

        const validClosures: AirportClosure[] = output.closures
          .filter((c) => c.endMin > c.startMin)
          .map((c, idx) => ({
            id: `ai-crisis-${c.airportId}-${c.startMin}-${idx}`,
            airportId: c.airportId,
            startMin: c.startMin,
            endMin: c.endMin,
            label: c.reasonLabel,
          }));

        if (validClosures.length > 0) {
          return NextResponse.json({
            closures: validClosures,
            summary: `Compiled ${validClosures.length} closure(s): ${validClosures
              .map(
                (c) =>
                  `${c.airportId} ${formatHHMM(c.startMin)}–${formatHHMM(c.endMin)} IST`
              )
              .join(", ")}.`,
            mode: "ai",
          });
        }
      } catch {
        // Fall through cleanly to deterministic parser
      }
    }

    const fallback = parseCrisisDeterministic(parsed.data.prompt);
    return NextResponse.json({
      ...fallback,
      mode: "deterministic",
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to parse crisis command." },
      { status: 500 }
    );
  }
}
