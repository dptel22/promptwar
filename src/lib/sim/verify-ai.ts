/**
 * Zero-hallucination verifier for AI dispatcher briefings.
 *
 * An allow-list is derived solely from the deterministic simulation and ranked
 * candidates. Any recommended candidate id, flight/tail/connection/crew id, or
 * standalone integer in the AI prose that is NOT on the allow-list is a
 * violation, and the API route then falls back to the deterministic briefing.
 */

import { formatHHMM } from "./constants";
import type {
  DispatcherBriefing,
  RecoveryEvaluation,
  SimulationResult,
} from "./types";

/** Outcome of verifying a briefing against the allow-list. */
export interface VerificationResult {
  valid: boolean;
  violations: string[];
}

/** Every identifier and integer an AI briefing is permitted to mention. */
export interface AllowList {
  numbers: Set<number>;
  flightIds: Set<string>;
  tailIds: Set<string>;
  connectionIds: Set<string>;
  crewIds: Set<string>;
  candidateIds: Set<string>;
}

/** Small constants any briefing may cite (fleet size, duty/turnaround limits). */
const BASE_NUMBERS = [0, 16, 30, 70, 180, 600];

/** Clock times are spoken as `HH:MM`, so both the hour and minute parts are allowed. */
function addTimeParts(set: Set<number>, minutes: number): void {
  const [hh, mm] = formatHHMM(minutes).split(":").map(Number);
  set.add(hh);
  set.add(mm);
}

function collectMetricTokens(result: SimulationResult, allow: AllowList): void {
  const m = result.metrics;
  const values = [
    m.totalFlights,
    m.onTimeFlights,
    m.delayedFlights,
    m.crewBreaches,
    m.cancelledFlights,
    m.totalDelayMinutes,
    m.maxDelayMinutes,
    m.brokenConnections,
    m.groundedPax,
    m.dualGroundedOverlapPax,
    m.missedConnectionPax,
    m.totalStrandedPax,
  ];
  for (const val of values) allow.numbers.add(Math.abs(val));

  for (const c of result.closures) {
    addTimeParts(allow.numbers, c.startMin);
    addTimeParts(allow.numbers, c.endMin);
    allow.numbers.add(c.endMin - c.startMin);
  }
}

/** Only disrupted (or spare/buffer-affected) flights may be named by the AI. */
function collectFlightTokens(result: SimulationResult, allow: AllowList): void {
  for (const f of result.flights) {
    if (f.status === "ON_TIME" && !f.isSpareOperated && f.bufferAbsorbedMin <= 0) continue;
    allow.flightIds.add(f.flight_id);
    allow.tailIds.add(f.tail_id);
    allow.tailIds.add(f.activeTailId);
    allow.crewIds.add(f.activeCrewId);
    for (const n of [f.pax, f.delayMin, f.bufferAbsorbedMin, f.crewOvertimeMin]) {
      allow.numbers.add(n);
    }
    addTimeParts(allow.numbers, f.scheduledDepMin);
    addTimeParts(allow.numbers, f.actualDepMin);
    addTimeParts(allow.numbers, f.actualArrMin);
  }
}

function collectConnectionTokens(result: SimulationResult, allow: AllowList): void {
  for (const cx of result.connections) {
    if (cx.status === "INTACT") continue;
    allow.connectionIds.add(cx.connection_id);
    allow.flightIds.add(cx.from_flight);
    allow.flightIds.add(cx.to_flight);
    allow.numbers.add(cx.passengers);
    allow.numbers.add(cx.min_connect_minutes);
    allow.numbers.add(cx.shortfallMin);
    if (cx.actualConnectMin !== null) allow.numbers.add(Math.abs(cx.actualConnectMin));
  }
}

function collectCrewTokens(result: SimulationResult, allow: AllowList): void {
  for (const cr of result.crews) {
    if (!cr.breached) continue;
    allow.crewIds.add(cr.crewId);
    allow.tailIds.add(cr.tailId);
    allow.numbers.add(cr.overtimeMin);
    if (cr.breachFlightId) allow.flightIds.add(cr.breachFlightId);
  }
}

function collectSimulationTokens(result: SimulationResult, allow: AllowList): void {
  collectMetricTokens(result, allow);
  collectFlightTokens(result, allow);
  collectConnectionTokens(result, allow);
  collectCrewTokens(result, allow);
}

function collectCandidateTokens(evaluation: RecoveryEvaluation, allow: AllowList): void {
  evaluation.candidates.forEach((c, i) => {
    allow.candidateIds.add(c.id);
    allow.numbers.add(i + 1); // Option ordinals ("option 2") are legitimate.
    const d = c.deltas;
    for (const n of [
      d.strandedPaxDelta,
      d.crewBreachesDelta,
      d.delayedFlightsDelta,
      d.totalDelayMinutesDelta,
    ]) {
      allow.numbers.add(Math.abs(n));
    }
    allow.numbers.add(d.savedConnections);

    for (const action of c.actions) {
      if (action.type === "SWAP_SPARE") {
        allow.tailIds.add(action.spareTailId);
        allow.flightIds.add(action.targetFlightId);
      } else if (action.type === "CANCEL_FLIGHT") {
        for (const fid of action.flightIds) allow.flightIds.add(fid);
      } else {
        allow.connectionIds.add(action.connectionId);
        allow.flightIds.add(action.flightId);
        allow.numbers.add(action.holdMinutes);
      }
    }
    collectSimulationTokens(c.result, allow);
  });
}

/**
 * Builds the grounded allow-list for an evaluation.
 *
 * @param evaluation - Baseline simulation and ranked candidates.
 * @returns Sets of permitted numbers and identifiers.
 */
export function buildAllowList(evaluation: RecoveryEvaluation): AllowList {
  const allow: AllowList = {
    numbers: new Set<number>(BASE_NUMBERS),
    flightIds: new Set<string>(),
    tailIds: new Set<string>(),
    connectionIds: new Set<string>(),
    crewIds: new Set<string>(),
    candidateIds: new Set<string>(),
  };
  collectSimulationTokens(evaluation.baseline, allow);
  collectCandidateTokens(evaluation, allow);
  return allow;
}

/** Flags every `pattern` match in `text` that is absent from `allowed`. */
function flagUngrounded(
  text: string,
  pattern: RegExp,
  allowed: Set<string>,
  label: string,
  violations: string[]
): void {
  for (const match of text.matchAll(pattern)) {
    if (!allowed.has(match[0])) violations.push(`${label}: ${match[0]}`);
  }
}

function checkRecommendation(
  briefing: DispatcherBriefing,
  evaluation: RecoveryEvaluation,
  allow: AllowList,
  violations: string[]
): void {
  const id = briefing.recommendedCandidateId;
  if (evaluation.candidates.length === 0) {
    if (id !== null) violations.push(`Invalid recommendedCandidateId "${id}" when no candidates exist`);
  } else if (!id || !allow.candidateIds.has(id)) {
    violations.push(`Invalid recommendedCandidateId "${id}"`);
  }

  for (const note of briefing.optionNotes) {
    if (!allow.candidateIds.has(note.candidateId)) {
      violations.push(`Unknown candidateId in optionNotes: ${note.candidateId}`);
    }
  }
}

/** Strips alphanumeric aviation identifiers so their digits are not read as integers. */
function stripIdentifiers(text: string): string {
  return text
    .replace(/\bDS\d{4}\b/g, " ")
    .replace(/\bVT-DS\d{2}\b/g, " ")
    .replace(/\bRES-\d{2}\b/g, " ")
    .replace(/\bCX\d{2}\b/g, " ")
    .replace(/\bCR\d{2}\b/g, " ");
}

/**
 * Verifies that every claim in an AI briefing is grounded in simulated data.
 *
 * @param briefing - AI generated briefing to check.
 * @param evaluation - Deterministic evaluation the briefing must agree with.
 * @returns `valid` plus a human-readable list of violations.
 */
export function verifyAiBriefing(
  briefing: DispatcherBriefing,
  evaluation: RecoveryEvaluation
): VerificationResult {
  const allow = buildAllowList(evaluation);
  const violations: string[] = [];
  checkRecommendation(briefing, evaluation, allow, violations);

  const text = [
    briefing.executiveSummary,
    briefing.tradeoffAnalysis,
    ...briefing.optionNotes.flatMap((n) => [n.rationale, n.tradeoff]),
  ].join(" ");

  flagUngrounded(text, /\bDS\d{4}\b/g, allow.flightIds, "Ungrounded flight ID", violations);
  flagUngrounded(text, /\bVT-DS\d{2}\b/g, allow.tailIds, "Ungrounded tail ID", violations);
  flagUngrounded(text, /\bCX\d{2}\b/g, allow.connectionIds, "Ungrounded connection ID", violations);
  flagUngrounded(text, /\bCR\d{2}\b/g, allow.crewIds, "Ungrounded crew ID", violations);

  for (const match of stripIdentifiers(text).matchAll(/\b\d+\b/g)) {
    if (!allow.numbers.has(Number(match[0]))) violations.push(`Ungrounded integer: ${match[0]}`);
  }

  return { valid: violations.length === 0, violations };
}
