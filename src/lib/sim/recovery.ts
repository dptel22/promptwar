import { DATASET, formatHHMM, simulateNetwork } from "./engine";
import { parseCrisisDeterministic } from "./parse-crisis";
import type {
  AirportClosure,
  DispatcherBriefing,
  RecoveryAction,
  RecoveryCandidate,
  RecoveryDeltas,
  RecoveryEvaluation,
  SimulatedFlight,
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

export function areActionsCompatible(
  a: RecoveryAction,
  b: RecoveryAction
): boolean {
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
      if (
        result.metrics.crewBreaches <= baseline.metrics.crewBreaches &&
        isStrictlyBetter(result, a.result) &&
        isStrictlyBetter(result, b.result)
      ) {
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

  let tradeoffAnalysis: string;
  if (top.deltas.strandedPaxDelta < 0 && top.deltas.crewBreachesDelta < 0) {
    tradeoffAnalysis = `Top option cuts stranded passengers from ${m.totalStrandedPax} to ${after.totalStrandedPax} (${top.deltas.strandedPaxDelta} pax) and clears ${Math.abs(top.deltas.crewBreachesDelta)} crew breach(es) with ${after.totalDelayMinutes} total delay minutes.`;
  } else if (top.deltas.strandedPaxDelta < 0) {
    tradeoffAnalysis = `Top option cuts stranded passengers from ${m.totalStrandedPax} to ${after.totalStrandedPax} (${top.deltas.strandedPaxDelta} pax) across ${after.delayedFlights} delayed flights and ${after.totalDelayMinutes} total delay minutes.`;
  } else if (top.deltas.crewBreachesDelta < 0) {
    tradeoffAnalysis = `Top option eliminates ${Math.abs(top.deltas.crewBreachesDelta)} crew breach(es) and sets total network delay to ${after.totalDelayMinutes} minutes.`;
  } else {
    tradeoffAnalysis = `Top option cuts network delay from ${m.totalDelayMinutes}m to ${after.totalDelayMinutes}m (${top.deltas.totalDelayMinutesDelta}m) and reduces delayed flights from ${m.delayedFlights} to ${after.delayedFlights}.`;
  }

  const optionNotes = candidates.map((c) => {
    const cm = c.result.metrics;
    const actionIds = c.actions
      .map((a) => {
        if (a.type === "SWAP_SPARE") return `${a.spareTailId} on ${a.targetFlightId}`;
        if (a.type === "CANCEL_FLIGHT") return a.flightIds.join("/");
        return `${a.connectionId} on ${a.flightId} (+${a.holdMinutes}m)`;
      })
      .join(" + ");

    const rationale =
      cm.totalStrandedPax !== m.totalStrandedPax || m.totalStrandedPax > 0
        ? `Executes ${actionIds}, bringing stranded passengers from ${m.totalStrandedPax} to ${cm.totalStrandedPax} and delayed flights to ${cm.delayedFlights}.`
        : `Executes ${actionIds}, cuts network delay from ${m.totalDelayMinutes}m to ${cm.totalDelayMinutes}m and sets delayed flights to ${cm.delayedFlights}.`;

    return {
      candidateId: c.id,
      rationale,
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

export interface DispatcherQueryResponse {
  answer: string;
  focusFlightId?: string;
  focusAirportId?: string;
  suggestedClosures?: AirportClosure[];
  actionLabel?: string;
}

function formatSigned(val: number, suffix = ""): string {
  return `${val > 0 ? "+" : ""}${val}${suffix}`;
}

function formatFlightSummary(f: SimulatedFlight): string {
  const statusPart =
    f.status === "CREW_BREACH"
      ? `CREW_BREACH (+${f.crewOvertimeMin}m over 600m duty)`
      : f.status === "CANCELLED"
        ? "CANCELLED"
        : f.delayMin > 0
          ? `DELAYED +${f.delayMin}m`
          : "ON_TIME";
  const chainText =
    f.causeChain.length > 0
      ? f.causeChain.map((s) => `${s.flightId} (${s.airportId}: ${s.summary})`).join(" -> ")
      : "Nominal on-time operation";
  return `${f.flight_id} (${f.activeTailId}, ${f.origin}->${f.destination}): sched ${f.dep}–${f.arr}, actual ${formatHHMM(f.actualDepMin)}–${formatHHMM(f.actualArrMin)} · ${statusPart} · buffer absorbed ${f.bufferAbsorbedMin}m · crew duty ${f.crewProjectedDutyMin}/600m. Domino chain: ${chainText}.`;
}

export function answerDispatcherQuery(
  query: string,
  simulation: SimulationResult,
  closures: AirportClosure[],
  activeActions: RecoveryAction[] = []
): DispatcherQueryResponse {
  const trimmed = query.trim();
  const q = trimmed.toLowerCase();

  // a) +30m storm extension cliff analysis
  if (
    q.includes("+30m") ||
    q.includes("extend") ||
    q.includes("extension") ||
    q.includes("longer") ||
    q.includes("cliff")
  ) {
    if (closures.length === 0) {
      return {
        answer:
          "No airport is currently closed. Click any airport beacon or load a storm scenario first to test a +30m extension cliff.",
      };
    }

    const extended = closures.map((c) => ({
      ...c,
      endMin: Math.min(1380, c.endMin + 30),
    }));
    const extSim = simulateNetwork(extended, activeActions);
    const curM = simulation.metrics;
    const extM = extSim.metrics;
    const delayedDelta = extM.delayedFlights - curM.delayedFlights;
    const paxDelta = extM.totalStrandedPax - curM.totalStrandedPax;
    const delayDelta = extM.totalDelayMinutes - curM.totalDelayMinutes;

    const newBreach = extSim.flights.find(
      (f) =>
        f.status === "CREW_BREACH" &&
        simulation.flightsById[f.flight_id]?.status !== "CREW_BREACH"
    );

    const breachNote = newBreach
      ? ` Triggers new CREW_BREACH on ${newBreach.flight_id} (${newBreach.activeTailId}, ${newBreach.origin}->${newBreach.destination}, +${newBreach.crewOvertimeMin}m over 600m duty).`
      : extM.crewBreaches > curM.crewBreaches
        ? ` Adds ${extM.crewBreaches - curM.crewBreaches} crew duty breach(es).`
        : ` Crew breaches remain at ${extM.crewBreaches}.`;

    const windowText = extended
      .map((c) => `${c.airportId} until ${formatHHMM(c.endMin)}`)
      .join(", ");

    return {
      answer: `Extending closure (+30m: ${windowText}) changes delayed flights by ${formatSigned(delayedDelta)} (${curM.delayedFlights} -> ${extM.delayedFlights}), stranded passengers by ${formatSigned(paxDelta)} (${curM.totalStrandedPax} -> ${extM.totalStrandedPax}), and network delay by ${formatSigned(delayDelta, "m")} (${curM.totalDelayMinutes}m -> ${extM.totalDelayMinutes}m).${breachNote}`,
      focusFlightId: newBreach?.flight_id,
      focusAirportId: extended[0]?.airportId,
      suggestedClosures: extended,
      actionLabel: "Apply +30m Extension",
    };
  }

  // c) Explicit flight ID lookup (DSxxxx)
  const flightMatch = trimmed.match(/\b(DS\d{4})\b/i);
  if (flightMatch) {
    const fid = flightMatch[1].toUpperCase();
    const flight = simulation.flightsById[fid];
    if (!flight) {
      return {
        answer: `Flight ${fid} was not found in the 70-flight Domino Sky network.`,
      };
    }
    return {
      answer: formatFlightSummary(flight),
      focusFlightId: flight.flight_id,
      focusAirportId: flight.rootCauseAirportId ?? flight.origin,
    };
  }

  // d) Explicit tail ID lookup (VT-DSxx)
  const tailMatch = trimmed.match(/\b(VT-DS\d{2})\b/i);
  if (tailMatch) {
    const tid = tailMatch[1].toUpperCase();
    const legs = simulation.flights
      .filter((f) => f.tail_id === tid || f.activeTailId === tid)
      .sort((a, b) => a.leg_order - b.leg_order);
    if (legs.length === 0) {
      return {
        answer: `Tail ${tid} was not found in the 16-aircraft roster.`,
      };
    }
    const breached = legs.find((l) => l.status === "CREW_BREACH");
    const firstDelayed = legs.find((l) => l.status !== "ON_TIME");
    const totalDelay = legs.reduce(
      (sum, l) => sum + (l.status === "DELAYED" ? l.delayMin : 0),
      0
    );
    const legLine = legs
      .map(
        (l) =>
          `${l.flight_id} (${l.origin}->${l.destination}: ${
            l.status === "ON_TIME"
              ? "ON_TIME"
              : l.status === "CREW_BREACH"
                ? "CREW_BREACH"
                : l.status === "CANCELLED"
                  ? "CANCELLED"
                  : `+${l.delayMin}m`
          })`
      )
      .join(" -> ");
    return {
      answer: `${tid} rotation (${legs.length} legs, ${totalDelay}m cumulative operated delay${
        breached ? `, CREW_BREACH on ${breached.flight_id}` : ", crew legal"
      }): ${legLine}.`,
      focusFlightId: (breached ?? firstDelayed ?? legs[0]).flight_id,
    };
  }

  // b) Worst domino cascade / bottleneck trace
  if (
    q.includes("worst") ||
    q.includes("domino") ||
    q.includes("cascade") ||
    q.includes("chain") ||
    q.includes("bottleneck")
  ) {
    const impacted = simulation.flights.filter((f) => f.status !== "ON_TIME");
    if (impacted.length === 0) {
      return {
        answer:
          "All 70 flights are operating on schedule with 0 delays and 0 crew breaches. Trigger a storm closure or ask e.g. '75m storm at HYD at 12:00' to trace a cascade.",
      };
    }

    impacted.sort((a, b) => {
      const rank = (f: SimulatedFlight) =>
        f.status === "CREW_BREACH" ? 0 : f.status === "DELAYED" ? 1 : 2;
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      if (b.delayMin !== a.delayMin) return b.delayMin - a.delayMin;
      return b.pax - a.pax;
    });

    const worst = impacted[0];
    const chainTrace =
      worst.causeChain.length > 0
        ? worst.causeChain
            .map((s) => `${s.flightId} (${s.airportId}: ${s.summary})`)
            .join(" -> ")
        : `${worst.flight_id} (${worst.origin}->${worst.destination}: ${worst.primaryReason})`;

    return {
      answer: `Worst cascade impact: ${worst.flight_id} on ${worst.activeTailId} (${worst.origin}->${worst.destination}) is ${worst.status}${
        worst.delayMin > 0 ? ` (+${worst.delayMin}m)` : ""
      }${worst.crewOvertimeMin > 0 ? `, +${worst.crewOvertimeMin}m crew overtime` : ""}. Trace: ${chainTrace}.`,
      focusFlightId: worst.flight_id,
      focusAirportId: worst.rootCauseAirportId ?? worst.origin,
    };
  }

  // e) Plain-English storm / airport what-if simulation
  if (trimmed.length >= 3) {
    const parsed = parseCrisisDeterministic(trimmed);
    if (parsed.closures.length > 0) {
      const sim = simulateNetwork(parsed.closures);
      const pm = sim.metrics;
      const summaryWindows = parsed.closures
        .map((c) => `${c.airportId} ${formatHHMM(c.startMin)}–${formatHHMM(c.endMin)}`)
        .join(", ");
      return {
        answer: `Simulated ${summaryWindows}: ${pm.delayedFlights} delayed flights, ${pm.totalStrandedPax} stranded pax, ${pm.crewBreaches} crew breaches, and ${pm.totalDelayMinutes}m total delay across ${pm.affectedTails.length} tails.`,
        focusAirportId: parsed.closures[0].airportId,
        suggestedClosures: parsed.closures,
        actionLabel: "Load Simulated Storm",
      };
    }
  }

  // f) Contextual network guidance
  const m = simulation.metrics;
  const activeSummary =
    closures.length > 0
      ? `Active closures (${closures.map((c) => `${c.airportId} ${formatHHMM(c.startMin)}–${formatHHMM(c.endMin)}`).join(", ")}): ${m.delayedFlights} delayed flights, ${m.totalStrandedPax} stranded pax, ${m.crewBreaches} crew breaches.`
      : "Network is currently running Clear Skies (70/70 flights on time).";

  return {
    answer: `${activeSummary} Try asking "+30m extension", "Trace worst domino chain", "Inspect DS0304", "VT-DS03 rotation", or "90m storm at DEL at 11:15".`,
  };
}
