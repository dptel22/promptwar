/**
 * Candidate recovery-action generation and compatibility rules.
 *
 * Proposals are only physically valid moves: spares deploy from their own base,
 * cancellations never strand an aircraft away from its next leg, and holds are
 * capped at 45 minutes. The evaluator then re-simulates each proposal.
 */

import { DATASET, MAX_CONNECTION_HOLD_MIN } from "./constants";
import { FLIGHTS_BY_ID } from "./dataset-index";
import type { RecoveryAction, SimulationResult } from "./types";

/** A single proposed recovery action tagged with its UI category. */
export interface ActionProposal {
  category: "SPARE" | "CANCEL" | "HOLD";
  action: RecoveryAction;
}

// Dataset-order grouping (not tail-sorted): candidate order feeds stable tie-breaks.
const TAIL_LEGS = (() => {
  const map = new Map<string, typeof DATASET.flights>();
  for (const f of DATASET.flights) {
    const legs = map.get(f.tail_id);
    if (legs) legs.push(f);
    else map.set(f.tail_id, [f]);
  }
  for (const legs of map.values()) legs.sort((a, b) => a.leg_order - b.leg_order);
  return map;
})();

function getActionTouchedTails(action: RecoveryAction): Set<string> {
  const flightIds =
    action.type === "SWAP_SPARE"
      ? [action.targetFlightId]
      : action.type === "CANCEL_FLIGHT"
        ? action.flightIds
        : [action.flightId];
  const tails = new Set<string>();
  for (const fid of flightIds) {
    const f = FLIGHTS_BY_ID.get(fid);
    if (f) tails.add(f.tail_id);
  }
  return tails;
}

/** True when a cancel action grounds either leg of the held connection. */
function cancelBreaksHold(cancel: RecoveryAction, hold: RecoveryAction): boolean {
  if (cancel.type !== "CANCEL_FLIGHT" || hold.type !== "HOLD_CONNECTION") return false;
  const cx = DATASET.connections.find((c) => c.connection_id === hold.connectionId);
  return (
    cx !== undefined &&
    (cancel.flightIds.includes(cx.from_flight) || cancel.flightIds.includes(cx.to_flight))
  );
}

/**
 * Decides whether two recovery actions can be applied together.
 *
 * @param a - First action.
 * @param b - Second action.
 * @returns `false` if they reuse a spare, touch the same tail, or cancel a held connection.
 */
export function areActionsCompatible(a: RecoveryAction, b: RecoveryAction): boolean {
  if (a.type === "SWAP_SPARE" && b.type === "SWAP_SPARE" && a.spareTailId === b.spareTailId) {
    return false;
  }
  const tailsB = getActionTouchedTails(b);
  for (const t of getActionTouchedTails(a)) {
    if (tailsB.has(t)) return false;
  }
  // Never hold a flight whose inbound or outbound is cancelled.
  return !cancelBreaksHold(a, b) && !cancelBreaksHold(b, a);
}

function proposeSpareSwaps(baseline: SimulationResult): ActionProposal[] {
  const out: ActionProposal[] = [];
  for (const spare of DATASET.spare_aircraft) {
    for (const f of baseline.flights) {
      if (f.origin !== spare.base) continue;
      if (f.status !== "DELAYED" && f.status !== "CREW_BREACH") continue;
      out.push({
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
  return out;
}

/** Only the last leg or an out-and-back spoke pair may be cancelled without teleporting aircraft. */
function proposeCancellations(baseline: SimulationResult): ActionProposal[] {
  const out: ActionProposal[] = [];
  for (const legs of TAIL_LEGS.values()) {
    if (legs.every((l) => baseline.flightsById[l.flight_id].status === "ON_TIME")) continue;

    const lastLeg = legs[legs.length - 1];
    if (baseline.flightsById[lastLeg.flight_id].status === "CREW_BREACH") {
      out.push({
        category: "CANCEL",
        action: {
          id: `cancel-${lastLeg.flight_id}`,
          type: "CANCEL_FLIGHT",
          flightIds: [lastLeg.flight_id],
          label: `Cancel crew-grounded ${lastLeg.flight_id} (${lastLeg.origin}->${lastLeg.destination})`,
        },
      });
    }

    for (let i = 0; i < legs.length - 1; i++) {
      const outLeg = legs[i];
      const backLeg = legs[i + 1];
      if (outLeg.origin !== backLeg.destination || outLeg.destination !== backLeg.origin) continue;
      out.push({
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
  return out;
}

function proposeHolds(baseline: SimulationResult): ActionProposal[] {
  const out: ActionProposal[] = [];
  for (const cx of baseline.connections) {
    if (cx.status !== "BROKEN_TIME") continue;
    const fromF = baseline.flightsById[cx.from_flight];
    const toF = baseline.flightsById[cx.to_flight];
    const grounded = [fromF, toF].some(
      (f) => f.status === "CANCELLED" || f.status === "CREW_BREACH"
    );
    if (grounded) continue;

    const neededHoldMin = fromF.actualArrMin + cx.min_connect_minutes - toF.actualDepMin;
    if (neededHoldMin <= 0 || neededHoldMin > MAX_CONNECTION_HOLD_MIN) continue;
    out.push({
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
  return out;
}

/**
 * Enumerates every physically valid single recovery action for a baseline.
 *
 * @param baseline - Simulation of the current disruption.
 * @returns Spare swaps, then cancellations, then connection holds.
 */
export function proposeActions(baseline: SimulationResult): ActionProposal[] {
  return [
    ...proposeSpareSwaps(baseline),
    ...proposeCancellations(baseline),
    ...proposeHolds(baseline),
  ];
}
