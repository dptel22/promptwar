/**
 * `POST /api/parse-crisis` - compiles a plain-English disruption into closures.
 *
 * With an LLM configured the model proposes closure windows (schema-constrained to
 * valid IATA codes and operating-day minutes); any failure or empty result falls
 * back to the deterministic parser, so this endpoint never depends on AI.
 */

import { NextResponse } from "next/server";
import { generateText, Output } from "ai";
import { z } from "zod";
import { readJsonBody, resolveAiModel } from "@/lib/ai/server-helpers";
import {
  CLOSURE_MAX,
  CLOSURE_MIN,
  DATASET,
  VALID_IATA,
  formatHHMM,
} from "@/lib/sim/constants";
import { parseCrisisDeterministic } from "@/lib/sim/parse-crisis";
import type { AirportClosure } from "@/lib/sim/types";

/** Live crisis commands must never be stored by shared proxies or CDNs. */
const NO_STORE = { "Cache-Control": "no-store" } as const;

const AI_TIMEOUT_MS = 6000;

const ParseRequestSchema = z.object({
  prompt: z.string().min(2).max(500),
});

const CrisisOutputSchema = z.object({
  closures: z
    .array(
      z.object({
        airportId: z.enum(VALID_IATA),
        startMin: z.number().int().min(CLOSURE_MIN).max(CLOSURE_MAX - 30),
        endMin: z.number().int().min(CLOSURE_MIN + 15).max(CLOSURE_MAX),
        reasonLabel: z.string().max(40),
      })
    )
    .max(5),
});

function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

function summarize(closures: AirportClosure[]): string {
  const windows = closures
    .map((c) => `${c.airportId} ${formatHHMM(c.startMin)}–${formatHHMM(c.endMin)} IST`)
    .join(", ");
  return `Compiled ${closures.length} closure(s): ${windows}.`;
}

/**
 * Asks the LLM for closures. Returns `null` on any failure so the caller can fall
 * back. The user text goes in `prompt` and the rules in `system`, keeping the
 * untrusted description separate from the instructions.
 */
async function parseWithAi(
  model: NonNullable<ReturnType<typeof resolveAiModel>>,
  userText: string
): Promise<AirportClosure[] | null> {
  const airportGuide = DATASET.airports.map((a) => `${a.id}:${a.city}`).join(", ");
  try {
    const { output } = await generateText({
      model,
      output: Output.object({ schema: CrisisOutputSchema }),
      abortSignal: AbortSignal.timeout(AI_TIMEOUT_MS),
      system: `Convert a plain-English Indian airport disruption request into structured airport closure time windows in minutes since 00:00 IST (e.g. 08:00 = 480, 09:30 = 570, 12:00 = 720).
Valid airports: ${airportGuide}.
Ensure endMin > startMin for every closure.`,
      prompt: userText,
    });

    const closures = output.closures
      .filter((c) => c.endMin > c.startMin)
      .map((c, idx) => ({
        id: `ai-crisis-${c.airportId}-${c.startMin}-${idx}`,
        airportId: c.airportId,
        startMin: c.startMin,
        endMin: c.endMin,
        label: c.reasonLabel,
      }));
    return closures.length > 0 ? closures : null;
  } catch {
    return null; // Timeout/schema failure: deterministic parser takes over.
  }
}

/**
 * Parses a crisis description into airport closures.
 *
 * @param req - JSON body `{ prompt: string }` (2-500 chars, max 32 KiB payload).
 * @returns `{ closures, summary, mode }` where mode is `"ai"` or `"deterministic"`.
 */
export async function POST(req: Request): Promise<NextResponse> {
  try {
    const body = await readJsonBody(req);
    if (!body.ok) return json({ error: body.error }, body.status);

    const parsed = ParseRequestSchema.safeParse(body.data);
    if (!parsed.success) {
      return json({ error: "Provide a crisis description (2-500 chars)." }, 400);
    }

    const model = resolveAiModel();
    const aiClosures = model ? await parseWithAi(model, parsed.data.prompt) : null;
    if (aiClosures) {
      return json({ closures: aiClosures, summary: summarize(aiClosures), mode: "ai" });
    }

    return json({ ...parseCrisisDeterministic(parsed.data.prompt), mode: "deterministic" });
  } catch {
    return json({ error: "Failed to parse crisis command." }, 500);
  }
}
