/**
 * Shared server-side helpers for AI Gateway/Gemini model resolution and bounded
 * JSON body ingestion across Next.js App Router handlers.
 */

import { google } from "@ai-sdk/google";
import { MAX_API_BODY_BYTES } from "@/lib/sim/constants";

/** Result returned by `readJsonBody` distinguishing size/syntax failures. */
export type JsonBodyResult =
  | { ok: true; data: unknown }
  | { ok: false; status: 400 | 413; error: string };

/**
 * Selects the configured LLM provider (Vercel AI Gateway or direct Gemini) or
 * returns `null` when running in offline deterministic fallback mode.
 *
 * @returns AI SDK model identifier/instance or `null` if no credentials exist.
 */
export function resolveAiModel() {
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

/**
 * Safely reads and parses a JSON request body while enforcing a strict byte limit
 * to prevent oversized payload abuse before schema validation runs.
 *
 * @param req - Incoming Web `Request`.
 * @param maxBytes - Maximum permitted UTF-8 byte length (defaults to 32 KiB).
 * @returns Discriminated parse result with status `413` or `400` on failure.
 */
export async function readJsonBody(
  req: Request,
  maxBytes: number = MAX_API_BODY_BYTES
): Promise<JsonBodyResult> {
  let rawText: string;
  try {
    rawText = await req.text();
  } catch {
    return { ok: false, status: 400, error: "Invalid JSON payload" };
  }

  if (Buffer.byteLength(rawText, "utf8") > maxBytes) {
    return { ok: false, status: 413, error: "Request body too large" };
  }

  try {
    return { ok: true, data: JSON.parse(rawText) };
  } catch {
    return { ok: false, status: 400, error: "Invalid JSON payload" };
  }
}
