/**
 * Deterministic network cascade engine for the Domino Sky schedule.
 *
 * `simulateNetwork` replays the single-day schedule tail by tail: weather
 * closures push departures/arrivals, late inbound aircraft eat turnaround buffer
 * and cascade down the rotation, crews are checked against the 600-minute duty
 * window, and recovery actions (cancel, spare swap, connection hold) rewrite the
 * rotation. Cross-tail connection holds depend on other tails, so the whole
 * network is iterated to a fixed point (usually 2-3 passes).
 *
 * Same inputs always yield the same output; there is no randomness or I/O.
 *
 * Related modules: `closure-holds` (airport closures), `tail-state` (crew duty,
 * spare takeover), `cause-chain` (domino lineage), `metrics` (connections + KPIs).
 */

import { parseActionMaps, type ActionMaps } from "./action-maps";
import { buildCauseChain } from "./cause-chain";
import { applyClosureHolds } from "./closure-holds";
import { DATASET, formatHHMM, getAirportById, parseHHMM } from "./constants";
import { SPARES_BY_ID, TAIL_CHAINS, type TailChain } from "./dataset-index";
import { aggregateNetworkMetrics, evaluateConnections } from "./metrics";
import {
  applyCrewLegality,
  buildCrewRecord,
  createTailState,
  takeOverWithSpare,
  type TailState,
} from "./tail-state";
import { applyConnectionHold, propagateTurnaround } from "./turnaround";
import type {
  AirportClosure,
  Flight,
  RecoveryAction,
  SimulatedCrew,
  SimulatedFlight,
  SimulationResult,
} from "./types";

export { DATASET, formatHHMM, getAirportById, parseHHMM };
export { applyClosureHolds, buildCauseChain, parseActionMaps };

/** Simulated flights keyed by `flight_id`. */
type FlightMap = Record<string, SimulatedFlight>;

/** Immutable inputs shared by every leg simulated in one `simulateNetwork` call. */
export interface SimContext {
  closures: AirportClosure[];
  maps: ActionMaps;
}

function buildCancelledFlight(
  f: Flight,
  st: TailState,
  scheduledDepMin: number,
  scheduledArrMin: number
): SimulatedFlight {
  return {
    ...f,
    activeTailId: st.activeTailId,
    activeCrewId: st.activeCrewId,
    isSpareOperated: st.isSpareOperated,
    scheduledDepMin,
    scheduledArrMin,
    actualDepMin: scheduledDepMin,
    actualArrMin: scheduledArrMin,
    delayMin: 0,
    holdingStartMin: null,
    holdingEndMin: null,
    scheduledTurnaroundMin: st.prevLeg
      ? scheduledDepMin - st.prevLeg.scheduledArrMin
      : f.turnaround_before_min,
    turnaroundBufferMin: 0,
    bufferAbsorbedMin: 0,
    crewDutyStartMin: st.dutyStartMin,
    crewDutyLimitMin: st.dutyLimitMin,
    crewProjectedDutyMin: 0,
    crewOvertimeMin: 0,
    status: "CANCELLED",
    primaryReason: "RECOVERY_CANCELLED",
    causeFlightId: null,
    rootCauseAirportId: null,
    causeChain: [],
  };
}

function simulateLeg(
  f: Flight,
  st: TailState,
  ctx: SimContext,
  prev: FlightMap
): SimulatedFlight {
  const scheduledDepMin = parseHHMM(f.dep);
  const scheduledArrMin = parseHHMM(f.arr);

  if (ctx.maps.cancelledIds.has(f.flight_id)) {
    return buildCancelledFlight(f, st, scheduledDepMin, scheduledArrMin);
  }

  const spare = SPARES_BY_ID.get(ctx.maps.spareSwapByFlightId.get(f.flight_id) ?? "");
  if (spare && spare.base === f.origin) {
    takeOverWithSpare(st, spare, f, scheduledDepMin, ctx.closures);
  }

  // Order matters: turnaround and holds first, closures last, so late aircraft
  // can never depart from or land at a closed airport.
  const turn = applyConnectionHold(
    ctx.maps.holdByFlightId.get(f.flight_id),
    propagateTurnaround(f, st.prevLeg, scheduledDepMin),
    prev
  );
  const timing = applyClosureHolds(f, turn.readyDep, turn.cause, ctx.closures);
  const delayMin = Math.max(0, timing.actualArrMin - scheduledArrMin);
  const legal = applyCrewLegality(st, f, timing.actualArrMin, delayMin, timing.cause);

  return {
    ...f,
    activeTailId: st.activeTailId,
    activeCrewId: st.activeCrewId,
    isSpareOperated: st.isSpareOperated,
    scheduledDepMin,
    scheduledArrMin,
    actualDepMin: timing.actualDepMin,
    actualArrMin: timing.actualArrMin,
    delayMin,
    holdingStartMin: timing.holdingStartMin,
    holdingEndMin: timing.holdingEndMin,
    scheduledTurnaroundMin: turn.scheduledTurnaroundMin,
    turnaroundBufferMin: turn.turnaroundBufferMin,
    bufferAbsorbedMin: turn.bufferAbsorbedMin,
    crewDutyStartMin: st.dutyStartMin,
    crewDutyLimitMin: st.dutyLimitMin,
    crewProjectedDutyMin: timing.actualArrMin - st.dutyStartMin,
    crewOvertimeMin: Math.max(0, timing.actualArrMin - st.dutyLimitMin),
    status: legal.status,
    primaryReason: legal.cause.reason,
    causeFlightId: legal.cause.causeFlightId,
    rootCauseAirportId: legal.cause.rootCauseAirportId,
    causeChain: [],
  };
}

function legChanged(old: SimulatedFlight | undefined, leg: SimulatedFlight): boolean {
  return (
    !old ||
    old.actualDepMin !== leg.actualDepMin ||
    old.actualArrMin !== leg.actualArrMin ||
    old.status !== leg.status
  );
}

/**
 * Simulates every leg of one tail rotation, writing results into `nextById`.
 *
 * @param chain - Tail rotation with its crew.
 * @param ctx - Closures and recovery lookup tables.
 * @param prev - Previous fixed-point pass (for cross-tail holds).
 * @param nextById - Output map receiving this pass's simulated legs.
 * @returns Crew record plus whether any leg differs from the previous pass.
 */
export function simulateTailChain(
  chain: TailChain,
  ctx: SimContext,
  prev: FlightMap,
  nextById: FlightMap
): { crew: SimulatedCrew; changed: boolean } {
  const st = createTailState(chain);
  let changed = false;

  for (const f of chain.flights) {
    const leg = simulateLeg(f, st, ctx, prev);
    nextById[f.flight_id] = leg;
    // A breached or cancelled leg never operates, so it cannot feed a turnaround.
    if (leg.status !== "CREW_BREACH" && leg.status !== "CANCELLED") st.prevLeg = leg;
    changed = legChanged(prev[f.flight_id], leg) || changed;
  }
  return { crew: buildCrewRecord(chain, st), changed };
}

/** Closures usable by the engine: positive window at a known airport, sorted by start. */
function sanitizeClosures(closures: AirportClosure[]): AirportClosure[] {
  return closures
    .filter((c) => c.endMin > c.startMin && getAirportById(c.airportId) !== undefined)
    .map((c) => ({ ...c }))
    .sort((a, b) => a.startMin - b.startMin);
}

/**
 * Simulates the full 70-flight network under closures and recovery actions.
 *
 * @param closures - Airport closure windows (invalid ones are dropped).
 * @param actions - Recovery actions to apply (cancel / spare swap / hold).
 * @returns Flights, connections, crews and aggregate metrics.
 */
export function simulateNetwork(
  closures: AirportClosure[],
  actions: RecoveryAction[] = []
): SimulationResult {
  const ctx: SimContext = {
    closures: sanitizeClosures(closures),
    maps: parseActionMaps(actions),
  };

  let flightsById: FlightMap = {};
  let crews: SimulatedCrew[] = [];

  // Fixed-point loop: cross-tail connection holds stabilise within 2-3 passes.
  for (let pass = 0; pass < 5; pass++) {
    const nextById: FlightMap = {};
    const nextCrews: SimulatedCrew[] = [];
    let changed = false;
    for (const chain of TAIL_CHAINS) {
      const res = simulateTailChain(chain, ctx, flightsById, nextById);
      nextCrews.push(res.crew);
      changed = changed || res.changed;
    }
    flightsById = nextById;
    crews = nextCrews;
    if (!changed) break;
  }

  const flights = DATASET.flights.map((f) => flightsById[f.flight_id]);
  for (const sf of flights) sf.causeChain = buildCauseChain(sf, flightsById);
  const connections = evaluateConnections(flightsById);

  return {
    closures: ctx.closures,
    actions,
    flights,
    flightsById,
    connections,
    crews,
    metrics: aggregateNetworkMetrics(flights, connections),
  };
}
