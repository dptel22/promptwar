/**
 * Canonical operational bounds, aviation domain constants, and IST time utilities
 * shared across the deterministic simulation engine, API validators, and UI layers.
 */

import rawDataset from "../../data/domino-sky-dataset.json";
import type { Airport, DominoDataset } from "./types";

/** Typed airline schedule dataset spanning 16 Indian airports and 70 single-day flights. */
export const DATASET: DominoDataset = rawDataset as DominoDataset;

/** Valid 3-letter IATA airport codes present in the Domino Sky network. */
export const VALID_IATA = DATASET.airports.map((a) => a.id) as [
  string,
  ...string[],
];

/** Earliest simulated schedule minute of day (05:30 IST). */
export const CLOCK_MIN = 330;

/** Latest simulated schedule minute of day (22:30 IST). */
export const CLOCK_MAX = 1350;

/** Minimum permissible airport closure start minute (05:00 IST). */
export const CLOSURE_MIN = 300;

/** Maximum permissible airport closure reopen minute (23:00 IST). */
export const CLOSURE_MAX = 1380;

/** Required minimum aircraft turnaround between consecutive legs in minutes. */
export const MIN_TURNAROUND_MIN = DATASET.meta.min_turnaround_minutes;

/** Statutory maximum crew flight duty window per operating day in minutes. */
export const MAX_CREW_DUTY_MIN = 600;

/** Maximum passenger-connection hold duration allowed by recovery dispatch. */
export const MAX_CONNECTION_HOLD_MIN = 45;

/** Pre-departure standby reserve crew briefing lead time in minutes. */
export const RESERVE_BRIEFING_MIN = 30;

/** Upper request payload ceiling (bytes) enforced by API route handlers. */
export const MAX_API_BODY_BYTES = 32_768;

const AIRPORTS_BY_ID = new Map<string, Airport>(
  DATASET.airports.map((a) => [a.id, a])
);

/**
 * Converts a 24-hour `HH:MM` string into elapsed minutes since 00:00 IST.
 *
 * @param hhmm - Clock string in `HH:MM` format.
 * @returns Integer minutes since midnight.
 */
export function parseHHMM(hhmm: string): number {
  const [hh, mm] = hhmm.split(":").map(Number);
  return hh * 60 + mm;
}

/**
 * Formats an elapsed minute-of-day value as a zero-padded `HH:MM` IST string.
 *
 * @param minutes - Elapsed minutes since 00:00 IST.
 * @returns Clock label formatted as `HH:MM`.
 */
export function formatHHMM(minutes: number): string {
  const clamped = Math.max(0, Math.round(minutes));
  const hh = Math.floor(clamped / 60) % 24;
  const mm = clamped % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/**
 * Looks up an Indian airport record by its 3-letter IATA code.
 *
 * @param airportId - Three-letter IATA airport identifier.
 * @returns Matching `Airport` record or `undefined` when unknown.
 */
export function getAirportById(airportId: string): Airport | undefined {
  return AIRPORTS_BY_ID.get(airportId);
}
