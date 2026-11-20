/**
 * Recovery-action normalisation for the cascade engine.
 *
 * Turns the user/AI supplied `RecoveryAction[]` into O(1) lookup tables and
 * silently discards physically impossible requests (e.g. teleporting a spare).
 */

import { FLIGHTS_BY_ID, SPARES_BY_ID } from "./dataset-index";
import type { RecoveryAction } from "./types";

/** A `HOLD_CONNECTION` recovery action. */
export type HoldAction = Extract<RecoveryAction, { type: "HOLD_CONNECTION" }>;

/** Lookup tables derived from the requested recovery actions. */
export interface ActionMaps {
  cancelledIds: Set<string>;
  spareSwapByFlightId: Map<string, string>;
  holdByFlightId: Map<string, HoldAction>;
}

/**
 * Normalises recovery actions into O(1) lookup tables.
 *
 * A spare swap is accepted only when the spare is based at the target flight's
 * origin and has not already been committed to another flight, so a single
 * spare tail can never be in two places at once.
 *
 * @param actions - Requested recovery actions.
 * @returns Cancel set, spare-swap map keyed by flight, and hold map keyed by flight.
 */
export function parseActionMaps(actions: RecoveryAction[]): ActionMaps {
  const maps: ActionMaps = {
    cancelledIds: new Set(),
    spareSwapByFlightId: new Map(),
    holdByFlightId: new Map(),
  };
  const usedSpareIds = new Set<string>();

  for (const action of actions) {
    if (action.type === "CANCEL_FLIGHT") {
      for (const fid of action.flightIds) maps.cancelledIds.add(fid);
    } else if (action.type === "SWAP_SPARE") {
      const spare = SPARES_BY_ID.get(action.spareTailId);
      const target = FLIGHTS_BY_ID.get(action.targetFlightId);
      const feasible =
        spare !== undefined &&
        target !== undefined &&
        spare.base === target.origin &&
        !usedSpareIds.has(spare.tail_id);
      if (feasible) {
        usedSpareIds.add(action.spareTailId);
        maps.spareSwapByFlightId.set(action.targetFlightId, action.spareTailId);
      }
    } else {
      maps.holdByFlightId.set(action.flightId, action);
    }
  }
  return maps;
}
