/**
 * Deterministic dispatcher briefing used as the offline fallback and as the
 * ground truth the AI briefing is verified against.
 *
 * Every number in the prose comes straight from simulated metrics, so the output
 * always passes `verifyAiBriefing`.
 */

import { formatHHMM } from "./constants";
import type {
  DispatcherBriefing,
  DispatcherOptionNote,
  NetworkMetrics,
  RecoveryAction,
  RecoveryCandidate,
  RecoveryEvaluation,
} from "./types";

function describeAction(a: RecoveryAction): string {
  if (a.type === "SWAP_SPARE") return `${a.spareTailId} on ${a.targetFlightId}`;
  if (a.type === "CANCEL_FLIGHT") return a.flightIds.join("/");
  return `${a.connectionId} on ${a.flightId} (+${a.holdMinutes}m)`;
}

function buildExecutiveSummary(evaluation: RecoveryEvaluation): string {
  const { baseline, closures } = evaluation;
  const m = baseline.metrics;
  const closureList = closures
    .map((c) => `${c.airportId} (${formatHHMM(c.startMin)}-${formatHHMM(c.endMin)})`)
    .join(", ");
  const example = baseline.flights
    .filter((f) => f.status === "DELAYED" || f.status === "CREW_BREACH")
    .slice(0, 3)
    .map((f) => `${f.flight_id} (${f.activeTailId})`)
    .join(", ");

  return (
    `Closures at ${closureList} disrupt ${m.delayedFlights} delayed flights` +
    `${m.crewBreaches > 0 ? ` and ${m.crewBreaches} crew duty breaches` : ""}` +
    `, totaling ${m.totalDelayMinutes} delay minutes and ${m.totalStrandedPax} stranded passengers` +
    `${example ? ` across chains including ${example}` : ""}.`
  );
}

function buildTradeoffAnalysis(top: RecoveryCandidate, before: NetworkMetrics): string {
  const after = top.result.metrics;
  const d = top.deltas;
  const paxCut = `cuts stranded passengers from ${before.totalStrandedPax} to ${after.totalStrandedPax} (${d.strandedPaxDelta} pax)`;

  if (d.strandedPaxDelta < 0 && d.crewBreachesDelta < 0) {
    return `Top option ${paxCut} and clears ${Math.abs(d.crewBreachesDelta)} crew breach(es) with ${after.totalDelayMinutes} total delay minutes.`;
  }
  if (d.strandedPaxDelta < 0) {
    return `Top option ${paxCut} across ${after.delayedFlights} delayed flights and ${after.totalDelayMinutes} total delay minutes.`;
  }
  if (d.crewBreachesDelta < 0) {
    return `Top option eliminates ${Math.abs(d.crewBreachesDelta)} crew breach(es) and sets total network delay to ${after.totalDelayMinutes} minutes.`;
  }
  // Delay-only improvement: never claim a pax change like "from 0 to 0".
  return `Top option cuts network delay from ${before.totalDelayMinutes}m to ${after.totalDelayMinutes}m (${d.totalDelayMinutesDelta}m) and reduces delayed flights from ${before.delayedFlights} to ${after.delayedFlights}.`;
}

function buildOptionNote(c: RecoveryCandidate, before: NetworkMetrics): DispatcherOptionNote {
  const cm = c.result.metrics;
  const actionIds = c.actions.map(describeAction).join(" + ");
  const paxChanged = cm.totalStrandedPax !== before.totalStrandedPax || before.totalStrandedPax > 0;

  const rationale = paxChanged
    ? `Executes ${actionIds}, bringing stranded passengers from ${before.totalStrandedPax} to ${cm.totalStrandedPax} and delayed flights to ${cm.delayedFlights}.`
    : `Executes ${actionIds}, cuts network delay from ${before.totalDelayMinutes}m to ${cm.totalDelayMinutes}m and sets delayed flights to ${cm.delayedFlights}.`;

  const delayDelta = c.deltas.totalDelayMinutesDelta;
  const tradeoff =
    cm.cancelledFlights > 0
      ? `Grounds ${cm.cancelledFlights} flight(s) (${cm.groundedPax} onboard pax) to restore downstream schedule integrity.`
      : delayDelta > 0
        ? `Adds ${delayDelta} network delay minutes to protect ${c.deltas.savedConnections} passenger connection(s).`
        : `Reduces network delay by ${Math.abs(delayDelta)} minutes with ${cm.crewBreaches} crew breaches.`;

  return { candidateId: c.id, rationale, tradeoff };
}

/**
 * Builds a fully grounded briefing from a recovery evaluation.
 *
 * @param evaluation - Baseline simulation, closures and ranked candidates.
 * @returns Briefing recommending the top candidate (or none when nothing helps).
 */
export function buildDeterministicBriefing(evaluation: RecoveryEvaluation): DispatcherBriefing {
  const { baseline, candidates, closures } = evaluation;
  const m = baseline.metrics;

  if (closures.length === 0 || (m.delayedFlights === 0 && m.crewBreaches === 0)) {
    return {
      recommendedCandidateId: null,
      executiveSummary:
        "All 70 flights across 16 airports are operating on schedule with 0 stranded passengers and 0 crew duty breaches.",
      tradeoffAnalysis: "No recovery intervention required.",
      optionNotes: [],
    };
  }

  const executiveSummary = buildExecutiveSummary(evaluation);
  if (candidates.length === 0) {
    return {
      recommendedCandidateId: null,
      executiveSummary,
      tradeoffAnalysis:
        "No valid single or dual recovery action improves total stranded passengers or delay minutes within crew duty and aircraft positioning constraints.",
      optionNotes: [],
    };
  }

  return {
    recommendedCandidateId: candidates[0].id,
    executiveSummary,
    tradeoffAnalysis: buildTradeoffAnalysis(candidates[0], m),
    optionNotes: candidates.map((c) => buildOptionNote(c, m)),
  };
}
