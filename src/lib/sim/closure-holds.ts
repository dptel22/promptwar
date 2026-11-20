/**
 * Airport-closure timing for the cascade engine.
 *
 * Resolves where a leg's departure/arrival lands once every closure window is
 * respected, distinguishing ATC holding orbits (already airborne) from
 * ground-delay programs (still at the gate).
 */

import type { AirportClosure, DelayReason, Flight } from "./types";

/** Root-cause attribution carried along a leg's delay lineage. */
export interface Cause {
  reason: DelayReason;
  causeFlightId: string | null;
  rootCauseAirportId: string | null;
}

/** Cause value for a leg with no delay lineage. */
export const NO_CAUSE: Cause = {
  reason: "NONE",
  causeFlightId: null,
  rootCauseAirportId: null,
};

/** Actual timings of a leg after every airport closure has been applied. */
export interface ClosureTiming {
  actualDepMin: number;
  actualArrMin: number;
  holdingStartMin: number | null;
  holdingEndMin: number | null;
  cause: Cause;
}

/**
 * Finds the closure covering `minute` at an airport (end is exclusive).
 *
 * @param closures - Candidate closure windows.
 * @param airportId - IATA code to look up.
 * @param minute - Minute of day to test.
 * @returns The active closure or `undefined`.
 */
export function findActiveClosure(
  closures: AirportClosure[],
  airportId: string,
  minute: number
): AirportClosure | undefined {
  return closures.find(
    (c) => c.airportId === airportId && minute >= c.startMin && minute < c.endMin
  );
}

function weatherCause(
  reason: DelayReason,
  flightId: string,
  airportId: string
): Cause {
  return { reason, causeFlightId: flightId, rootCauseAirportId: airportId };
}

/**
 * Pushes a leg out of origin/destination closures until it is stable.
 *
 * Runs AFTER turnaround propagation so a late aircraft can never depart from or
 * land at a closed airport. A flight already airborne when the destination
 * closes enters an ATC holding orbit; otherwise a ground-delay program holds it.
 *
 * @param f - Scheduled leg.
 * @param readyDep - Earliest departure after turnaround/hold logic.
 * @param cause - Cause accumulated so far (replaced by weather when a closure bites).
 * @param closures - Valid closures sorted by start.
 * @returns Final departure/arrival minutes, holding window and cause.
 */
export function applyClosureHolds(
  f: Flight,
  readyDep: number,
  cause: Cause,
  closures: AirportClosure[]
): ClosureTiming {
  const t: ClosureTiming = {
    actualDepMin: readyDep,
    actualArrMin: readyDep + f.block_minutes,
    holdingStartMin: null,
    holdingEndMin: null,
    cause,
  };
  // Each closure forces at most one departure and one arrival push, bounding the loop.
  const maxSteps = closures.length * 2 + 2;

  for (let step = 0; step < maxSteps; step++) {
    const depClosure = findActiveClosure(closures, f.origin, t.actualDepMin);
    if (depClosure) {
      t.actualDepMin = depClosure.endMin;
      t.actualArrMin = t.actualDepMin + f.block_minutes;
      t.holdingStartMin = null;
      t.holdingEndMin = null;
      t.cause = weatherCause("PRIMARY_WEATHER_DEP_HOLD", f.flight_id, f.origin);
      continue;
    }

    const arrClosure = findActiveClosure(closures, f.destination, t.actualArrMin);
    if (!arrClosure) break;

    if (t.actualDepMin < arrClosure.startMin) {
      // Already airborne before the storm: orbit until the destination reopens.
      t.holdingStartMin = t.actualDepMin + f.block_minutes;
      t.holdingEndMin = arrClosure.endMin;
      t.actualArrMin = arrClosure.endMin;
    } else {
      // Ground Delay Program: wait at origin so arrival lands at reopening.
      t.actualDepMin = Math.max(t.actualDepMin, arrClosure.endMin - f.block_minutes);
      t.actualArrMin = Math.max(arrClosure.endMin, t.actualDepMin + f.block_minutes);
      t.holdingStartMin = null;
      t.holdingEndMin = null;
    }
    t.cause = weatherCause("PRIMARY_WEATHER_ARR_HOLD", f.flight_id, f.destination);
  }
  return t;
}
