/**
 * Deterministic recovery evaluator.
 *
 * Generates every valid single recovery action, re-simulates each one through the
 * cascade engine, keeps only strict improvements, then tries the best
 * non-conflicting pairs. Ranking is lexicographic: stranded pax, crew breaches,
 * delay minutes, then fewest actions. Briefing and query modules are re-exported
 * so existing callers keep a single import surface.
 */

import { simulateNetwork } from "./engine";
import { areActionsCompatible, proposeActions } from "./recovery-actions";
import type {
  AirportClosure,
  RecoveryAction,
  RecoveryCandidate,
  RecoveryDeltas,
  RecoveryEvaluation,
  SimulationResult,
} from "./types";

export { buildDeterministicBriefing } from "./briefing";
export { answerDispatcherQuery } from "./query";
export type { DispatcherQueryResponse } from "./query";
export { areActionsCompatible };

/** Number of best single candidates considered when searching two-action combos. */
const COMBO_POOL_SIZE = 6;

function compareResults(a: SimulationResult, b: SimulationResult): number {
  const x = a.metrics;
  const y = b.metrics;
  return (
    x.totalStrandedPax - y.totalStrandedPax ||
    x.crewBreaches - y.crewBreaches ||
    x.totalDelayMinutes - y.totalDelayMinutes ||
    a.actions.length - b.actions.length
  );
}

function isStrictlyBetter(after: SimulationResult, before: SimulationResult): boolean {
  return compareResults(after, before) < 0;
}

function computeDeltas(after: SimulationResult, before: SimulationResult): RecoveryDeltas {
  const intact = (r: SimulationResult) =>
    r.connections.filter((c) => c.status === "INTACT").length;
  return {
    strandedPaxDelta: after.metrics.totalStrandedPax - before.metrics.totalStrandedPax,
    crewBreachesDelta: after.metrics.crewBreaches - before.metrics.crewBreaches,
    delayedFlightsDelta: after.metrics.delayedFlights - before.metrics.delayedFlights,
    totalDelayMinutesDelta:
      after.metrics.totalDelayMinutes - before.metrics.totalDelayMinutes,
    savedConnections: Math.max(0, intact(after) - intact(before)),
  };
}

function isUndisrupted(baseline: SimulationResult): boolean {
  const m = baseline.metrics;
  return m.delayedFlights === 0 && m.crewBreaches === 0 && m.brokenConnections === 0;
}

/** Simulates each compatible single proposal and keeps strict improvements, best first. */
function evaluateSingles(
  closures: AirportClosure[],
  baseline: SimulationResult,
  existing: RecoveryAction[]
): RecoveryCandidate[] {
  const existingIds = new Set(existing.map((a) => a.id));
  const candidates: RecoveryCandidate[] = [];

  for (const { category, action } of proposeActions(baseline)) {
    if (existingIds.has(action.id)) continue;
    if (!existing.every((ex) => areActionsCompatible(ex, action))) continue;

    const result = simulateNetwork(closures, [...existing, action]);
    if (!isStrictlyBetter(result, baseline)) continue;
    // A hold must never trade a delay for a brand-new crew duty breach.
    if (action.type === "HOLD_CONNECTION" && result.metrics.crewBreaches > baseline.metrics.crewBreaches) {
      continue;
    }
    candidates.push({
      id: action.id,
      title: action.label,
      category,
      actions: [action],
      result,
      deltas: computeDeltas(result, baseline),
    });
  }
  return candidates.sort((a, b) => compareResults(a.result, b.result));
}

/** Tries every compatible pair from the top singles; a combo must beat both members. */
function evaluateCombos(
  closures: AirportClosure[],
  baseline: SimulationResult,
  existing: RecoveryAction[],
  singles: RecoveryCandidate[]
): RecoveryCandidate[] {
  const pool = singles.slice(0, COMBO_POOL_SIZE);
  const combos: RecoveryCandidate[] = [];

  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const [a, b] = [pool[i], pool[j]];
      if (!areActionsCompatible(a.actions[0], b.actions[0])) continue;

      const actions = [a.actions[0], b.actions[0]];
      const result = simulateNetwork(closures, [...existing, ...actions]);
      if (
        result.metrics.crewBreaches <= baseline.metrics.crewBreaches &&
        isStrictlyBetter(result, a.result) &&
        isStrictlyBetter(result, b.result)
      ) {
        combos.push({
          id: `${a.id}__${b.id}`,
          title: actions.map((x) => x.label).join(" + "),
          category: "COMBO",
          actions,
          result,
          deltas: computeDeltas(result, baseline),
        });
      }
    }
  }
  return combos;
}

/** Drops candidates with identical outcome signatures, preserving the top-ranked one. */
function dedupeTop(ranked: RecoveryCandidate[], limit: number): RecoveryCandidate[] {
  const seen = new Set<string>();
  const unique: RecoveryCandidate[] = [];
  for (const c of ranked) {
    const m = c.result.metrics;
    const types = c.actions.map((a) => a.type).join(",");
    const signature = `${m.totalStrandedPax}:${m.crewBreaches}:${m.totalDelayMinutes}:${types}`;
    if (seen.has(signature)) continue;
    seen.add(signature);
    unique.push(c);
    if (unique.length >= limit) break;
  }
  return unique;
}

/**
 * Ranks verified recovery candidates for the current closures.
 *
 * @param closures - Active airport closures.
 * @param limit - Maximum candidates returned (default 5).
 * @param existingActions - Already-applied actions to build on (follow-on recovery).
 * @returns Baseline simulation and ranked, de-duplicated candidates.
 */
export function evaluateRecoveryCandidates(
  closures: AirportClosure[],
  limit = 5,
  existingActions: RecoveryAction[] = []
): RecoveryEvaluation {
  const baseline = simulateNetwork(closures, existingActions);
  if (isUndisrupted(baseline)) return { closures, baseline, candidates: [] };

  const singles = evaluateSingles(closures, baseline, existingActions);
  const combos = evaluateCombos(closures, baseline, existingActions, singles);
  const ranked = [...singles, ...combos].sort((a, b) => compareResults(a.result, b.result));

  return { closures, baseline, candidates: dedupeTop(ranked, limit) };
}
