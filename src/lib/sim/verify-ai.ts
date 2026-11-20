import { formatHHMM } from "./engine";
import type { DispatcherBriefing, RecoveryEvaluation } from "./types";

export interface VerificationResult {
  valid: boolean;
  violations: string[];
}

export interface AllowList {
  numbers: Set<number>;
  flightIds: Set<string>;
  tailIds: Set<string>;
  connectionIds: Set<string>;
  crewIds: Set<string>;
  candidateIds: Set<string>;
}

function addTimeParts(set: Set<number>, minutes: number) {
  const hhmm = formatHHMM(minutes);
  const [hh, mm] = hhmm.split(":").map((part) => Number(part));
  set.add(hh);
  set.add(mm);
}

function collectSimulationTokens(
  result: RecoveryEvaluation["baseline"],
  allow: AllowList
) {
  const m = result.metrics;
  const metricValues = [
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
  for (const val of metricValues) {
    allow.numbers.add(Math.abs(val));
  }

  for (const c of result.closures) {
    addTimeParts(allow.numbers, c.startMin);
    addTimeParts(allow.numbers, c.endMin);
    allow.numbers.add(c.endMin - c.startMin);
  }

  for (const f of result.flights) {
    if (
      f.status !== "ON_TIME" ||
      f.isSpareOperated ||
      f.bufferAbsorbedMin > 0
    ) {
      allow.flightIds.add(f.flight_id);
      allow.tailIds.add(f.tail_id);
      allow.tailIds.add(f.activeTailId);
      allow.crewIds.add(f.activeCrewId);
      allow.numbers.add(f.pax);
      allow.numbers.add(f.delayMin);
      allow.numbers.add(f.bufferAbsorbedMin);
      allow.numbers.add(f.crewOvertimeMin);
      addTimeParts(allow.numbers, f.scheduledDepMin);
      addTimeParts(allow.numbers, f.actualDepMin);
      addTimeParts(allow.numbers, f.actualArrMin);
    }
  }

  for (const cx of result.connections) {
    if (cx.status !== "INTACT") {
      allow.connectionIds.add(cx.connection_id);
      allow.flightIds.add(cx.from_flight);
      allow.flightIds.add(cx.to_flight);
      allow.numbers.add(cx.passengers);
      allow.numbers.add(cx.min_connect_minutes);
      allow.numbers.add(cx.shortfallMin);
      if (cx.actualConnectMin !== null) {
        allow.numbers.add(Math.abs(cx.actualConnectMin));
      }
    }
  }

  for (const cr of result.crews) {
    if (cr.breached) {
      allow.crewIds.add(cr.crewId);
      allow.tailIds.add(cr.tailId);
      allow.numbers.add(cr.overtimeMin);
      if (cr.breachFlightId) allow.flightIds.add(cr.breachFlightId);
    }
  }
}

export function buildAllowList(evaluation: RecoveryEvaluation): AllowList {
  const allow: AllowList = {
    numbers: new Set<number>([0, 16, 30, 70, 180, 600]),
    flightIds: new Set<string>(),
    tailIds: new Set<string>(),
    connectionIds: new Set<string>(),
    crewIds: new Set<string>(),
    candidateIds: new Set<string>(),
  };

  collectSimulationTokens(evaluation.baseline, allow);

  for (let i = 0; i < evaluation.candidates.length; i++) {
    const c = evaluation.candidates[i];
    allow.candidateIds.add(c.id);
    allow.numbers.add(i + 1);
    allow.numbers.add(Math.abs(c.deltas.strandedPaxDelta));
    allow.numbers.add(Math.abs(c.deltas.crewBreachesDelta));
    allow.numbers.add(Math.abs(c.deltas.delayedFlightsDelta));
    allow.numbers.add(Math.abs(c.deltas.totalDelayMinutesDelta));
    allow.numbers.add(c.deltas.savedConnections);

    for (const action of c.actions) {
      if (action.type === "SWAP_SPARE") {
        allow.tailIds.add(action.spareTailId);
        allow.flightIds.add(action.targetFlightId);
      } else if (action.type === "CANCEL_FLIGHT") {
        for (const fid of action.flightIds) allow.flightIds.add(fid);
      } else if (action.type === "HOLD_CONNECTION") {
        allow.connectionIds.add(action.connectionId);
        allow.flightIds.add(action.flightId);
        allow.numbers.add(action.holdMinutes);
      }
    }

    collectSimulationTokens(c.result, allow);
  }

  return allow;
}

export function verifyAiBriefing(
  briefing: DispatcherBriefing,
  evaluation: RecoveryEvaluation
): VerificationResult {
  const allow = buildAllowList(evaluation);
  const violations: string[] = [];

  if (evaluation.candidates.length === 0) {
    if (briefing.recommendedCandidateId !== null) {
      violations.push(
        `Invalid recommendedCandidateId "${briefing.recommendedCandidateId}" when no candidates exist`
      );
    }
  } else if (
    !briefing.recommendedCandidateId ||
    !allow.candidateIds.has(briefing.recommendedCandidateId)
  ) {
    violations.push(
      `Invalid recommendedCandidateId "${briefing.recommendedCandidateId}"`
    );
  }

  const proseSegments = [
    briefing.executiveSummary,
    briefing.tradeoffAnalysis,
    ...briefing.optionNotes.flatMap((n) => [n.rationale, n.tradeoff]),
  ];

  for (const note of briefing.optionNotes) {
    if (!allow.candidateIds.has(note.candidateId)) {
      violations.push(`Unknown candidateId in optionNotes: ${note.candidateId}`);
    }
  }

  const combinedText = proseSegments.join(" ");

  for (const match of combinedText.matchAll(/\bDS\d{4}\b/g)) {
    if (!allow.flightIds.has(match[0])) {
      violations.push(`Ungrounded flight ID: ${match[0]}`);
    }
  }

  for (const match of combinedText.matchAll(/\bVT-DS\d{2}\b/g)) {
    if (!allow.tailIds.has(match[0])) {
      violations.push(`Ungrounded tail ID: ${match[0]}`);
    }
  }

  for (const match of combinedText.matchAll(/\bCX\d{2}\b/g)) {
    if (!allow.connectionIds.has(match[0])) {
      violations.push(`Ungrounded connection ID: ${match[0]}`);
    }
  }

  for (const match of combinedText.matchAll(/\bCR\d{2}\b/g)) {
    if (!allow.crewIds.has(match[0])) {
      violations.push(`Ungrounded crew ID: ${match[0]}`);
    }
  }

  // Strip alphanumeric aviation identifiers before verifying standalone integers
  const sanitizedForNumbers = combinedText
    .replace(/\bDS\d{4}\b/g, " ")
    .replace(/\bVT-DS\d{2}\b/g, " ")
    .replace(/\bRES-\d{2}\b/g, " ")
    .replace(/\bCX\d{2}\b/g, " ")
    .replace(/\bCR\d{2}\b/g, " ");

  for (const match of sanitizedForNumbers.matchAll(/\b\d+\b/g)) {
    const num = Number(match[0]);
    if (!allow.numbers.has(num)) {
      violations.push(`Ungrounded integer: ${match[0]}`);
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}
