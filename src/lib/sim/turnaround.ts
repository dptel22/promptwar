/**
 * Turnaround propagation and recovery connection holds for the cascade engine.
 *
 * Answers "how early can this leg depart?" from the inbound aircraft's actual
 * arrival (absorbing schedule slack first) and from an optional capped
 * passenger-connection hold. Airport closures are applied afterwards.
 */

import type { HoldAction } from "./action-maps";
import { NO_CAUSE, type Cause } from "./closure-holds";
import { MAX_CONNECTION_HOLD_MIN, MIN_TURNAROUND_MIN } from "./constants";
import { CONNECTIONS_BY_ID } from "./dataset-index";
import type { Flight, SimulatedFlight } from "./types";

/** Readiness after turnaround, with buffer-absorption bookkeeping. */
export interface Turnaround {
  readyDep: number;
  cause: Cause;
  scheduledTurnaroundMin: number | null;
  turnaroundBufferMin: number;
  bufferAbsorbedMin: number;
}

/**
 * Computes earliest departure from the previous operated leg of the same aircraft.
 *
 * @param f - Leg being scheduled.
 * @param prevLeg - Previous operated leg (or `null` for the first leg / after a spare swap).
 * @param scheduledDepMin - Scheduled departure minute of `f`.
 * @returns Ready time, cause, and buffer bookkeeping.
 */
export function propagateTurnaround(
  f: Flight,
  prevLeg: SimulatedFlight | null,
  scheduledDepMin: number
): Turnaround {
  if (!prevLeg) {
    return {
      readyDep: scheduledDepMin,
      cause: NO_CAUSE,
      scheduledTurnaroundMin: f.turnaround_before_min,
      turnaroundBufferMin: 0,
      bufferAbsorbedMin: 0,
    };
  }

  const scheduledTurnaroundMin = scheduledDepMin - prevLeg.scheduledArrMin;
  const turnaroundBufferMin = Math.max(0, scheduledTurnaroundMin - MIN_TURNAROUND_MIN);
  const inboundDelay = Math.max(0, prevLeg.actualArrMin - prevLeg.scheduledArrMin);
  const earliestFromInbound = prevLeg.actualArrMin + MIN_TURNAROUND_MIN;
  const late = earliestFromInbound > scheduledDepMin;

  return {
    readyDep: late ? earliestFromInbound : scheduledDepMin,
    cause: late
      ? {
          reason: "LATE_INBOUND_AIRCRAFT",
          causeFlightId: prevLeg.flight_id,
          rootCauseAirportId: prevLeg.rootCauseAirportId,
        }
      : NO_CAUSE,
    scheduledTurnaroundMin,
    turnaroundBufferMin,
    // Slack in the scheduled turnaround absorbs inbound lateness before it cascades.
    bufferAbsorbedMin: Math.min(inboundDelay, turnaroundBufferMin),
  };
}

/**
 * Delays departure to protect a passenger connection, capped at 45 minutes.
 * Reads the PREVIOUS pass snapshot so cross-tail holds converge via the fixed point.
 *
 * @param hold - Requested hold for this flight, if any.
 * @param turn - Turnaround result to adjust.
 * @param prev - Flights from the previous fixed-point pass.
 * @returns `turn` unchanged, or a copy with the held departure and cause.
 */
export function applyConnectionHold(
  hold: HoldAction | undefined,
  turn: Turnaround,
  prev: Record<string, SimulatedFlight>
): Turnaround {
  if (!hold) return turn;
  const cx = CONNECTIONS_BY_ID.get(hold.connectionId);
  const inbound = cx ? prev[cx.from_flight] : undefined;
  if (!cx || !inbound || inbound.status === "CANCELLED" || inbound.status === "CREW_BREACH") {
    return turn;
  }

  const maxHold = Math.min(MAX_CONNECTION_HOLD_MIN, Math.max(0, hold.holdMinutes));
  const neededDep = inbound.actualArrMin + cx.min_connect_minutes;
  const heldDep = Math.min(neededDep, turn.readyDep + maxHold);
  if (heldDep <= turn.readyDep) return turn;

  return {
    ...turn,
    readyDep: heldDep,
    cause: {
      reason: "CONNECTION_HOLD",
      causeFlightId: inbound.flight_id,
      rootCauseAirportId: inbound.rootCauseAirportId,
    },
  };
}
