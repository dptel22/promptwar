/**
 * Natural-language "ask the dispatcher" engine.
 *
 * Answers are produced by deterministic handlers evaluated in a fixed priority
 * order (extension what-if, flight ID, tail ID, worst cascade, storm what-if,
 * guidance). Every figure is read from a real simulation, never invented.
 */

import { CLOSURE_MAX, formatHHMM } from "./constants";
import { simulateNetwork } from "./engine";
import { parseCrisisDeterministic } from "./parse-crisis";
import type {
  AirportClosure,
  RecoveryAction,
  SimulatedFlight,
  SimulationResult,
} from "./types";

/** Answer to a dispatcher question plus optional UI focus/action hints. */
export interface DispatcherQueryResponse {
  answer: string;
  focusFlightId?: string;
  focusAirportId?: string;
  suggestedClosures?: AirportClosure[];
  actionLabel?: string;
}

/** Everything a handler may need to answer one question. */
interface QueryContext {
  raw: string;
  lower: string;
  simulation: SimulationResult;
  closures: AirportClosure[];
  activeActions: RecoveryAction[];
}

type QueryHandler = (ctx: QueryContext) => DispatcherQueryResponse | null;

function formatSigned(val: number, suffix = ""): string {
  return `${val > 0 ? "+" : ""}${val}${suffix}`;
}

function includesAny(text: string, needles: string[]): boolean {
  return needles.some((n) => text.includes(n));
}

function windowLabel(c: AirportClosure): string {
  return `${c.airportId} ${formatHHMM(c.startMin)}–${formatHHMM(c.endMin)}`;
}

function formatChain(f: SimulatedFlight): string {
  return f.causeChain.map((s) => `${s.flightId} (${s.airportId}: ${s.summary})`).join(" -> ");
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
  const chainText = f.causeChain.length > 0 ? formatChain(f) : "Nominal on-time operation";
  return `${f.flight_id} (${f.activeTailId}, ${f.origin}->${f.destination}): sched ${f.dep}–${f.arr}, actual ${formatHHMM(f.actualDepMin)}–${formatHHMM(f.actualArrMin)} · ${statusPart} · buffer absorbed ${f.bufferAbsorbedMin}m · crew duty ${f.crewProjectedDutyMin}/600m. Domino chain: ${chainText}.`;
}

function describeNewBreach(
  extSim: SimulationResult,
  simulation: SimulationResult
): { note: string; flight?: SimulatedFlight } {
  const cur = simulation.metrics;
  const ext = extSim.metrics;
  const flight = extSim.flights.find(
    (f) =>
      f.status === "CREW_BREACH" &&
      simulation.flightsById[f.flight_id]?.status !== "CREW_BREACH"
  );
  if (flight) {
    return {
      flight,
      note: ` Triggers new CREW_BREACH on ${flight.flight_id} (${flight.activeTailId}, ${flight.origin}->${flight.destination}, +${flight.crewOvertimeMin}m over 600m duty).`,
    };
  }
  return {
    note:
      ext.crewBreaches > cur.crewBreaches
        ? ` Adds ${ext.crewBreaches - cur.crewBreaches} crew duty breach(es).`
        : ` Crew breaches remain at ${ext.crewBreaches}.`,
  };
}

/** (a) "+30m" extension cliff analysis: re-simulates closures reopening 30 minutes later. */
const answerExtension: QueryHandler = (ctx) => {
  if (!includesAny(ctx.lower, ["+30m", "extend", "extension", "longer", "cliff"])) return null;
  if (ctx.closures.length === 0) {
    return {
      answer:
        "No airport is currently closed. Click any airport beacon or load a storm scenario first to test a +30m extension cliff.",
    };
  }

  const extended = ctx.closures.map((c) => ({ ...c, endMin: Math.min(CLOSURE_MAX, c.endMin + 30) }));
  const extSim = simulateNetwork(extended, ctx.activeActions);
  const cur = ctx.simulation.metrics;
  const ext = extSim.metrics;
  const breach = describeNewBreach(extSim, ctx.simulation);
  const windowText = extended.map((c) => `${c.airportId} until ${formatHHMM(c.endMin)}`).join(", ");

  return {
    answer: `Extending closure (+30m: ${windowText}) changes delayed flights by ${formatSigned(ext.delayedFlights - cur.delayedFlights)} (${cur.delayedFlights} -> ${ext.delayedFlights}), stranded passengers by ${formatSigned(ext.totalStrandedPax - cur.totalStrandedPax)} (${cur.totalStrandedPax} -> ${ext.totalStrandedPax}), and network delay by ${formatSigned(ext.totalDelayMinutes - cur.totalDelayMinutes, "m")} (${cur.totalDelayMinutes}m -> ${ext.totalDelayMinutes}m).${breach.note}`,
    focusFlightId: breach.flight?.flight_id,
    focusAirportId: extended[0]?.airportId,
    suggestedClosures: extended,
    actionLabel: "Apply +30m Extension",
  };
};

/** (c) Explicit flight lookup (`DSxxxx`). */
const answerFlightLookup: QueryHandler = (ctx) => {
  const match = ctx.raw.match(/\b(DS\d{4})\b/i);
  if (!match) return null;
  const fid = match[1].toUpperCase();
  const flight = ctx.simulation.flightsById[fid];
  if (!flight) return { answer: `Flight ${fid} was not found in the 70-flight Domino Sky network.` };
  return {
    answer: formatFlightSummary(flight),
    focusFlightId: flight.flight_id,
    focusAirportId: flight.rootCauseAirportId ?? flight.origin,
  };
};

function formatLegStatus(l: SimulatedFlight): string {
  return l.status === "DELAYED" ? `+${l.delayMin}m` : l.status;
}

/** (d) Explicit tail rotation lookup (`VT-DSxx`). */
const answerTailLookup: QueryHandler = (ctx) => {
  const match = ctx.raw.match(/\b(VT-DS\d{2})\b/i);
  if (!match) return null;
  const tid = match[1].toUpperCase();
  const legs = ctx.simulation.flights
    .filter((f) => f.tail_id === tid || f.activeTailId === tid)
    .sort((a, b) => a.leg_order - b.leg_order);
  if (legs.length === 0) return { answer: `Tail ${tid} was not found in the 16-aircraft roster.` };

  const breached = legs.find((l) => l.status === "CREW_BREACH");
  const firstDelayed = legs.find((l) => l.status !== "ON_TIME");
  const totalDelay = legs.reduce((sum, l) => sum + (l.status === "DELAYED" ? l.delayMin : 0), 0);
  const legLine = legs
    .map((l) => `${l.flight_id} (${l.origin}->${l.destination}: ${formatLegStatus(l)})`)
    .join(" -> ");
  const crewNote = breached ? `, CREW_BREACH on ${breached.flight_id}` : ", crew legal";

  return {
    answer: `${tid} rotation (${legs.length} legs, ${totalDelay}m cumulative operated delay${crewNote}): ${legLine}.`,
    focusFlightId: (breached ?? firstDelayed ?? legs[0]).flight_id,
  };
};

function severityRank(f: SimulatedFlight): number {
  return f.status === "CREW_BREACH" ? 0 : f.status === "DELAYED" ? 1 : 2;
}

/** (b) Worst cascade: crew breaches first, then longest delay, then most passengers. */
const answerWorstCascade: QueryHandler = (ctx) => {
  if (!includesAny(ctx.lower, ["worst", "domino", "cascade", "chain", "bottleneck"])) return null;
  const impacted = ctx.simulation.flights.filter((f) => f.status !== "ON_TIME");
  if (impacted.length === 0) {
    return {
      answer:
        "All 70 flights are operating on schedule with 0 delays and 0 crew breaches. Trigger a storm closure or ask e.g. '75m storm at HYD at 12:00' to trace a cascade.",
    };
  }

  impacted.sort(
    (a, b) => severityRank(a) - severityRank(b) || b.delayMin - a.delayMin || b.pax - a.pax
  );
  const worst = impacted[0];
  const trace =
    worst.causeChain.length > 0
      ? formatChain(worst)
      : `${worst.flight_id} (${worst.origin}->${worst.destination}: ${worst.primaryReason})`;
  const delayNote = worst.delayMin > 0 ? ` (+${worst.delayMin}m)` : "";
  const overtimeNote = worst.crewOvertimeMin > 0 ? `, +${worst.crewOvertimeMin}m crew overtime` : "";

  return {
    answer: `Worst cascade impact: ${worst.flight_id} on ${worst.activeTailId} (${worst.origin}->${worst.destination}) is ${worst.status}${delayNote}${overtimeNote}. Trace: ${trace}.`,
    focusFlightId: worst.flight_id,
    focusAirportId: worst.rootCauseAirportId ?? worst.origin,
  };
};

/** (e) Plain-English storm what-if, e.g. "90m storm at DEL at 11:15". */
const answerStormWhatIf: QueryHandler = (ctx) => {
  if (ctx.raw.length < 3) return null;
  const parsed = parseCrisisDeterministic(ctx.raw);
  if (parsed.closures.length === 0) return null;

  const pm = simulateNetwork(parsed.closures).metrics;
  return {
    answer: `Simulated ${parsed.closures.map(windowLabel).join(", ")}: ${pm.delayedFlights} delayed flights, ${pm.totalStrandedPax} stranded pax, ${pm.crewBreaches} crew breaches, and ${pm.totalDelayMinutes}m total delay across ${pm.affectedTails.length} tails.`,
    focusAirportId: parsed.closures[0].airportId,
    suggestedClosures: parsed.closures,
    actionLabel: "Load Simulated Storm",
  };
};

/** (f) Fallback guidance summarising the current network state. */
function answerGuidance(ctx: QueryContext): DispatcherQueryResponse {
  const m = ctx.simulation.metrics;
  const summary =
    ctx.closures.length > 0
      ? `Active closures (${ctx.closures.map(windowLabel).join(", ")}): ${m.delayedFlights} delayed flights, ${m.totalStrandedPax} stranded pax, ${m.crewBreaches} crew breaches.`
      : "Network is currently running Clear Skies (70/70 flights on time).";
  return {
    answer: `${summary} Try asking "+30m extension", "Trace worst domino chain", "Inspect DS0304", "VT-DS03 rotation", or "90m storm at DEL at 11:15".`,
  };
}

// Order is significant: explicit IDs outrank keyword intents, which outrank free-text what-ifs.
const HANDLERS: QueryHandler[] = [
  answerExtension,
  answerFlightLookup,
  answerTailLookup,
  answerWorstCascade,
  answerStormWhatIf,
  answerGuidance,
];

/**
 * Answers a dispatcher question against the current simulation.
 *
 * @param query - Free-text question.
 * @param simulation - Current network simulation.
 * @param closures - Active closures.
 * @param activeActions - Applied recovery actions reused by what-if simulations.
 * @returns Answer text with optional focus and suggested-closure hints.
 */
export function answerDispatcherQuery(
  query: string,
  simulation: SimulationResult,
  closures: AirportClosure[],
  activeActions: RecoveryAction[] = []
): DispatcherQueryResponse {
  const raw = query.trim();
  const ctx: QueryContext = { raw, lower: raw.toLowerCase(), simulation, closures, activeActions };
  for (const handler of HANDLERS) {
    const response = handler(ctx);
    if (response) return response;
  }
  return answerGuidance(ctx);
}
