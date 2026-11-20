import { DATASET, formatHHMM, simulateNetwork } from "./engine";
import type {
  AirportClosure,
  DispatcherBriefing,
  RecoveryAction,
  RecoveryCandidate,
  RecoveryDeltas,
  RecoveryEvaluation,
  SimulationResult,
} from "./types";

const FLIGHTS_BY_ID = new Map(DATASET.flights.map((f) => [f.flight_id, f]));

const TAIL_LEGS = (() => {
  const map = new Map<string, typeof DATASET.flights>();
  for (const f of DATASET.flights) {
    const arr = map.get(f.tail_id);
    if (arr) arr.push(f);
    else map.set(f.tail_id, [f]);
  }
  for (const [, legs] of map) {
    legs.sort((a, b) => a.leg_order - b.leg_order);
  }
  return map;
})();

function compareResults(a: SimulationResult, b: SimulationResult): number {
  if (a.metrics.totalStrandedPax !== b.metrics.totalStrandedPax) {
    return a.metrics.totalStrandedPax - b.metrics.totalStrandedPax;
  }
  if (a.metrics.crewBreaches !== b.metrics.crewBreaches) {
    return a.metrics.crewBreaches - b.metrics.crewBreaches;
  }
  if (a.metrics.totalDelayMinutes !== b.metrics.totalDelayMinutes) {
    return a.metrics.totalDelayMinutes - b.metrics.totalDelayMinutes;
  }
  return a.actions.length - b.actions.length;
}

function isStrictlyBetter(after: SimulationResult, before: SimulationResult): boolean {
  return compareResults(after, before) < 0;
}

function computeDeltas(
  after: SimulationResult,
  before: SimulationResult
): RecoveryDeltas {
  const beforeIntact = before.connections.filter((c) => c.status === "INTACT").length;
  const afterIntact = after.connections.filter((c) => c.status === "INTACT").length;
  return {
    strandedPaxDelta: after.metrics.totalStrandedPax - before.metrics.totalStrandedPax,
    crewBreachesDelta: after.metrics.crewBreaches - before.metrics.crewBreaches,
    delayedFlightsDelta: after.metrics.delayedFlights - before.metrics.delayedFlights,
    totalDelayMinutesDelta:
      after.metrics.totalDelayMinutes - before.metrics.totalDelayMinutes,
    savedConnections: Math.max(0, afterIntact - beforeIntact),
  };
}

function getActionTouchedTails(action: RecoveryAction): Set<string> {
  const tails = new Set<string>();
  if (action.type === "SWAP_SPARE") {
    const f = FLIGHTS_BY_ID.get(action.targetFlightId);
    if (f) tails.add(f.tail_id);
  } else if (action.type === "CANCEL_FLIGHT") {
    for (const fid of action.flightIds) {
      const f = FLIGHTS_BY_ID.get(fid);
      if (f) tails.add(f.tail_id);
    }
  } else if (action.type === "HOLD_CONNECTION") {
    const f = FLIGHTS_BY_ID.get(action.flightId);
    if (f) tails.add(f.tail_id);
  }
  return tails;
}

function areActionsCompatible(a: RecoveryAction, b: RecoveryAction): boolean {
  if (a.type === "SWAP_SPARE" && b.type === "SWAP_SPARE") {
    if (a.spareTailId === b.spareTailId) return false;
  }
  const tailsA = getActionTouchedTails(a);
  const tailsB = getActionTouchedTails(b);
  for (const t of tailsA) {
    if (tailsB.has(t)) return false;
  }
  // Never hold a flight whose inbound or outbound is cancelled
  if (a.type === "CANCEL_FLIGHT" && b.type === "HOLD_CONNECTION") {
    const cx = DATASET.connections.find((c) => c.connection_id === b.connectionId);
    if (
      cx &&
      (a.flightIds.includes(cx.from_flight) || a.flightIds.includes(cx.to_flight))
    ) {
      return false;
    }
  }
  if (b.type === "CANCEL_FLIGHT" && a.type === "HOLD_CONNECTION") {
    const cx = DATASET.connections.find((c) => c.connection_id === a.connectionId);
    if (
      cx &&
      (b.flightIds.includes(cx.from_flight) || b.flightIds.includes(cx.to_flight))
    ) {
      return false;
    }
  }
  return true;
}

function candidateTitle(actions: RecoveryAction[]): string {
  return actions.map((a) => a.label).join(" + ");
}

export function evaluateRecoveryCandidates(
  closures: AirportClosure[],
  limit = 5,
  existingActions: RecoveryAction[] = []
): RecoveryEvaluation {
  const baseline = simulateNetwork(closures, existingActions);
  const m = baseline.metrics;
  const existingIds = new Set(existingActions.map((a) => a.id));

  if (
    m.delayedFlights === 0 &&
    m.crewBreaches === 0 &&
    m.brokenConnections === 0
  ) {
    return { closures, baseline, candidates: [] };
  }

  const singleActions: Array<{
    category: "SPARE" | "CANCEL" | "HOLD";
    action: RecoveryAction;
  }> = [];

  // 1. SWAP_SPARE candidates at BLR (VT-DS17) and DEL (VT-DS18)
  for (const spare of DATASET.spare_aircraft) {
    for (const f of baseline.flights) {
      if (f.origin !== spare.base) continue;
      if (f.status !== "DELAYED" && f.status !== "CREW_BREACH") continue;
      singleActions.push({
        category: "SPARE",
        action: {
          id: `swap-${spare.tail_id}-${f.flight_id}`,
          type: "SWAP_SPARE",
          spareTailId: spare.tail_id,
          targetFlightId: f.flight_id,
          label: `Deploy spare ${spare.tail_id} on ${f.flight_id} (${f.origin}->${f.destination})`,
        },
      });
    }
  }

  // 2. CANCEL_FLIGHT candidates (physically valid positioning only: last leg OR A->B + B->A spoke pair)
  for (const [, legs] of TAIL_LEGS) {
    const tailDisrupted = legs.some(
      (l) => baseline.flightsById[l.flight_id].status !== "ON_TIME"
    );
    if (!tailDisrupted) continue;

    // Option 2a: cancel final leg if grounded by crew breach (or last leg of disrupted chain)
    const lastLeg = legs[legs.length - 1];
    if (baseline.flightsById[lastLeg.flight_id].status === "CREW_BREACH") {
      singleActions.push({
        category: "CANCEL",
        action: {
          id: `cancel-${lastLeg.flight_id}`,
          type: "CANCEL_FLIGHT",
          flightIds: [lastLeg.flight_id],
          label: `Cancel crew-grounded ${lastLeg.flight_id} (${lastLeg.origin}->${lastLeg.destination})`,
        },
      });
    }

    // Option 2b: cancel a matched out-and-back spoke pair so aircraft stays in position for subsequent legs
    for (let i = 0; i < legs.length - 1; i++) {
      const outLeg = legs[i];
      const backLeg = legs[i + 1];
      if (
        outLeg.origin === backLeg.destination &&
        outLeg.destination === backLeg.origin
      ) {
        singleActions.push({
          category: "CANCEL",
          action: {
            id: `cancel-${outLeg.flight_id}-${backLeg.flight_id}`,
            type: "CANCEL_FLIGHT",
            flightIds: [outLeg.flight_id, backLeg.flight_id],
            label: `Cancel round-trip ${outLeg.flight_id}/${backLeg.flight_id} (${outLeg.origin}<->${outLeg.destination})`,
          },
        });
      }
    }
  }

  // 3. HOLD_CONNECTION candidates (<= 45 min hold, must not create new crew breaches)
  for (const cx of baseline.connections) {
    if (cx.status !== "BROKEN_TIME") continue;
    const fromF = baseline.flightsById[cx.from_flight];
    const toF = baseline.flightsById[cx.to_flight];
    if (
      fromF.status === "CANCELLED" ||
      fromF.status === "CREW_BREACH" ||
      toF.status === "CANCELLED" ||
      toF.status === "CREW_BREACH"
    ) {
      continue;
    }
    const neededHoldMin =
      fromF.actualArrMin + cx.min_connect_minutes - toF.actualDepMin;
    if (neededHoldMin > 0 && neededHoldMin <= 45) {
      singleActions.push({
        category: "HOLD",
        action: {
          id: `hold-${cx.connection_id}`,
          type: "HOLD_CONNECTION",
          connectionId: cx.connection_id,
          flightId: cx.to_flight,
          holdMinutes: neededHoldMin,
          label: `Hold ${cx.to_flight} +${neededHoldMin}m for ${cx.connection_id} (${cx.passengers} pax)`,
        },
      });
    }
  }

  const singleCandidates: RecoveryCandidate[] = [];
  for (const { category, action } of singleActions) {
    if (existingIds.has(action.id)) continue;
    if (!existingActions.every((ex) => areActionsCompatible(ex, action))) {
      continue;
    }
    const combined = [...existingActions, action];
    const result = simulateNetwork(closures, combined);
    if (!isStrictlyBetter(result, baseline)) continue;
    if (
      action.type === "HOLD_CONNECTION" &&
      result.metrics.crewBreaches > baseline.metrics.crewBreaches
    ) {
      continue;
    }
    singleCandidates.push({
      id: action.id,
      title: action.label,
      category,
      actions: [action],
      result,
      deltas: computeDeltas(result, baseline),
    });
  }

  singleCandidates.sort((a, b) => compareResults(a.result, b.result));

  // 4. Test top non-conflicting 2-action combinations
  const topPool = singleCandidates.slice(0, 6);
  const comboCandidates: RecoveryCandidate[] = [];

  for (let i = 0; i < topPool.length; i++) {
    for (let j = i + 1; j < topPool.length; j++) {
      const a = topPool[i];
      const b = topPool[j];
      if (!areActionsCompatible(a.actions[0], b.actions[0])) continue;

      const actions = [a.actions[0], b.actions[0]];
      const result = simulateNetwork(closures, [...existingActions, ...actions]);
      if (isStrictlyBetter(result, a.result) && isStrictlyBetter(result, b.result)) {
        comboCandidates.push({
          id: `${a.id}__${b.id}`,
          title: candidateTitle(actions),
          category: "COMBO",
          actions,
          result,
          deltas: computeDeltas(result, baseline),
        });
      }
    }
  }

  const allCandidates = [...singleCandidates, ...comboCandidates].sort((a, b) =>
    compareResults(a.result, b.result)
  );

  // Deduplicate identical outcome signatures while preserving top ranked action
  const seenSignatures = new Set<string>();
  const unique: RecoveryCandidate[] = [];
  for (const c of allCandidates) {
    const sig = `${c.result.metrics.totalStrandedPax}:${c.result.metrics.crewBreaches}:${c.result.metrics.totalDelayMinutes}:${c.actions.map((a) => a.type).join(",")}`;
    if (seenSignatures.has(sig)) continue;
    seenSignatures.add(sig);
    unique.push(c);
    if (unique.length >= limit) break;
  }

  return {
    closures,
    baseline,
    candidates: unique,
  };
}

export function buildDeterministicBriefing(
  evaluation: RecoveryEvaluation
): DispatcherBriefing {
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

  const closureList = closures
    .map((c) => `${c.airportId} (${formatHHMM(c.startMin)}-${formatHHMM(c.endMin)})`)
    .join(", ");

  const delayedExample = baseline.flights
    .filter((f) => f.status === "DELAYED" || f.status === "CREW_BREACH")
    .slice(0, 3)
    .map((f) => `${f.flight_id} (${f.activeTailId})`)
    .join(", ");

  const executiveSummary =
    `Closures at ${closureList} disrupt ${m.delayedFlights} delayed flights` +
    `${m.crewBreaches > 0 ? ` and ${m.crewBreaches} crew duty breaches` : ""}` +
    `, totaling ${m.totalDelayMinutes} delay minutes and ${m.totalStrandedPax} stranded passengers` +
    `${delayedExample ? ` across chains including ${delayedExample}` : ""}.`;

  if (candidates.length === 0) {
    return {
      recommendedCandidateId: null,
      executiveSummary,
      tradeoffAnalysis:
        "No valid single or dual recovery action improves total stranded passengers or delay minutes within crew duty and aircraft positioning constraints.",
      optionNotes: [],
    };
  }

  const top = candidates[0];
  const after = top.result.metrics;
  const tradeoffAnalysis =
    `Top option reduces stranded passengers from ${m.totalStrandedPax} to ${after.totalStrandedPax}` +
    ` (${top.deltas.strandedPaxDelta} pax) and sets crew breaches to ${after.crewBreaches}` +
    ` with ${after.totalDelayMinutes} total delay minutes.`;

  const optionNotes = candidates.map((c) => {
    const cm = c.result.metrics;
    const actionIds = c.actions
      .map((a) => {
        if (a.type === "SWAP_SPARE") return `${a.spareTailId} on ${a.targetFlightId}`;
        if (a.type === "CANCEL_FLIGHT") return a.flightIds.join("/");
        return `${a.connectionId} on ${a.flightId} (+${a.holdMinutes}m)`;
      })
      .join(" + ");

    return {
      candidateId: c.id,
      rationale: `Executes ${actionIds}, bringing stranded passengers from ${m.totalStrandedPax} to ${cm.totalStrandedPax} and delayed flights to ${cm.delayedFlights}.`,
      tradeoff:
        cm.cancelledFlights > 0
          ? `Grounds ${cm.cancelledFlights} flight(s) (${cm.groundedPax} onboard pax) to restore downstream schedule integrity.`
          : c.deltas.totalDelayMinutesDelta > 0
            ? `Adds ${c.deltas.totalDelayMinutesDelta} network delay minutes to protect ${c.deltas.savedConnections} passenger connection(s).`
            : `Reduces network delay by ${Math.abs(c.deltas.totalDelayMinutesDelta)} minutes with ${cm.crewBreaches} crew breaches.`,
    };
  });

  return {
    recommendedCandidateId: top.id,
    executiveSummary,
    tradeoffAnalysis,
    optionNotes,
  };
}
