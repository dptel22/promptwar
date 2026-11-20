/**
 * Mutable per-tail crew/aircraft state used while walking one rotation.
 *
 * Covers duty-clock bookkeeping, the 600-minute crew legality check, standby
 * spare takeover, and the final `SimulatedCrew` record.
 */

import {
  MAX_CREW_DUTY_MIN,
  RESERVE_BRIEFING_MIN,
  parseHHMM,
} from "./constants";
import { findActiveClosure, type Cause } from "./closure-holds";
import type { TailChain } from "./dataset-index";
import type {
  AirportClosure,
  Flight,
  FlightStatus,
  SimulatedCrew,
  SimulatedFlight,
  SpareAircraft,
} from "./types";

/** Mutable per-tail crew/aircraft state while walking one rotation. */
export interface TailState {
  activeTailId: string;
  activeCrewId: string;
  dutyStartMin: number;
  dutyLimitMin: number;
  maxProjectedEnd: number;
  overtime: number;
  breached: boolean;
  breachFlightId: string | null;
  isSpareOperated: boolean;
  prevLeg: SimulatedFlight | null;
  /** Snapshot of the original crew, frozen when a spare takes over mid-chain. */
  origCrew: {
    projectedEnd: number;
    breached: boolean;
    breachFlightId: string | null;
    overtime: number;
  };
}

/**
 * Creates the initial state for a tail operated by its assigned base crew.
 *
 * @param chain - Tail rotation with crew.
 * @returns Fresh state positioned at duty start.
 */
export function createTailState(chain: TailChain): TailState {
  const dutyStartMin = parseHHMM(chain.crew.duty_start);
  return {
    activeTailId: chain.tailId,
    activeCrewId: chain.crew.crew_id,
    dutyStartMin,
    dutyLimitMin: dutyStartMin + chain.crew.max_duty_mins,
    maxProjectedEnd: dutyStartMin,
    overtime: 0,
    breached: false,
    breachFlightId: null,
    isSpareOperated: false,
    prevLeg: null,
    origCrew: {
      projectedEnd: dutyStartMin,
      breached: false,
      breachFlightId: null,
      overtime: 0,
    },
  };
}

/**
 * Hands the rotation to a standby spare and reserve crew starting at flight `f`.
 *
 * @param st - Tail state mutated in place.
 * @param spare - Spare aircraft taking over.
 * @param f - First leg operated by the spare.
 * @param scheduledDepMin - Scheduled departure of `f`.
 * @param closures - Closures that may delay takeover at the origin.
 */
export function takeOverWithSpare(
  st: TailState,
  spare: SpareAircraft,
  f: Flight,
  scheduledDepMin: number,
  closures: AirportClosure[]
): void {
  if (!st.isSpareOperated) {
    st.origCrew = {
      projectedEnd: st.maxProjectedEnd,
      breached: st.breached,
      breachFlightId: st.breachFlightId,
      overtime: st.overtime,
    };
  }
  st.activeTailId = spare.tail_id;
  st.activeCrewId = `RES-${spare.tail_id.slice(-2)}`;
  st.isSpareOperated = true;
  st.prevLeg = null;
  st.breached = false;
  st.breachFlightId = null;

  let readyTakeover = Math.max(scheduledDepMin, parseHHMM(spare.available_from));
  const originClosure = findActiveClosure(closures, f.origin, readyTakeover);
  if (originClosure) readyTakeover = originClosure.endMin;

  // The reserve crew is briefed before takeover, so its duty clock starts earlier.
  st.dutyStartMin = readyTakeover - RESERVE_BRIEFING_MIN;
  st.dutyLimitMin = st.dutyStartMin + MAX_CREW_DUTY_MIN;
  st.maxProjectedEnd = st.dutyStartMin;
  st.overtime = 0;
}

/**
 * Applies the crew duty-window check to a leg and updates crew state.
 * Once a crew breaches, every later leg of that crew stays breached.
 *
 * @param st - Tail state mutated in place.
 * @param f - Leg being evaluated.
 * @param actualArrMin - Projected arrival minute.
 * @param delayMin - Arrival delay versus schedule.
 * @param cause - Cause accumulated before the crew check.
 * @returns Resulting status and (possibly rewritten) cause.
 */
export function applyCrewLegality(
  st: TailState,
  f: Flight,
  actualArrMin: number,
  delayMin: number,
  cause: Cause
): { status: FlightStatus; cause: Cause } {
  const overtimeMin = Math.max(0, actualArrMin - st.dutyLimitMin);
  st.maxProjectedEnd = Math.max(st.maxProjectedEnd, actualArrMin);

  if (!st.breached && actualArrMin <= st.dutyLimitMin) {
    return { status: delayMin > 0 ? "DELAYED" : "ON_TIME", cause };
  }
  st.breached = true;
  st.breachFlightId ??= f.flight_id;
  st.overtime = Math.max(st.overtime, overtimeMin);

  // Preserve an upstream cause when one exists so the domino lineage stays intact.
  const prev = st.prevLeg;
  const breachCause: Cause =
    cause.causeFlightId !== null || !prev
      ? { ...cause, reason: "CREW_DUTY_BREACH" }
      : {
          reason: "CREW_DUTY_BREACH",
          causeFlightId: prev.flight_id,
          rootCauseAirportId: prev.rootCauseAirportId,
        };
  return { status: "CREW_BREACH", cause: breachCause };
}

/**
 * Builds the crew record for a tail after its rotation is simulated.
 *
 * @param chain - Tail rotation with its base crew.
 * @param st - Final tail state.
 * @returns Crew record; after a spare swap it reports the original crew's frozen outcome.
 */
export function buildCrewRecord(chain: TailChain, st: TailState): SimulatedCrew {
  const { crew } = chain;
  const dutyStartMin = parseHHMM(crew.duty_start);
  const swapped = st.isSpareOperated;
  return {
    crewId: crew.crew_id,
    tailId: crew.tail_id,
    base: crew.base,
    dutyStartMin: swapped ? dutyStartMin : st.dutyStartMin,
    dutyLimitMin: swapped ? dutyStartMin + crew.max_duty_mins : st.dutyLimitMin,
    projectedEndMin: swapped ? st.origCrew.projectedEnd : st.maxProjectedEnd,
    breached: swapped ? st.origCrew.breached : st.breached,
    breachFlightId: swapped ? st.origCrew.breachFlightId : st.breachFlightId,
    overtimeMin: swapped ? st.origCrew.overtime : st.overtime,
  };
}
