/**
 * Precomputed dataset indexes shared by the cascade engine and the recovery
 * evaluator, built once at module load so each simulation avoids rescans.
 */

import { DATASET } from "./constants";
import type { Connection, Crew, Flight, SpareAircraft } from "./types";

/** Every scheduled flight keyed by `flight_id`. */
export const FLIGHTS_BY_ID: ReadonlyMap<string, Flight> = new Map(
  DATASET.flights.map((f) => [f.flight_id, f])
);

/** Reserve spare aircraft keyed by tail id. */
export const SPARES_BY_ID: ReadonlyMap<string, SpareAircraft> = new Map(
  DATASET.spare_aircraft.map((s) => [s.tail_id, s])
);

/** Passenger connections keyed by `connection_id`. */
export const CONNECTIONS_BY_ID: ReadonlyMap<string, Connection> = new Map(
  DATASET.connections.map((c) => [c.connection_id, c])
);

/** Rotation of one scheduled tail with its assigned base crew, in leg order. */
export interface TailChain {
  tailId: string;
  crew: Crew;
  flights: Flight[];
}

/** All operable tail rotations sorted by tail id (stable simulation order). */
export const TAIL_CHAINS: readonly TailChain[] = (() => {
  const crewByTail = new Map(DATASET.crews.map((c) => [c.tail_id, c]));
  const grouped = new Map<string, Flight[]>();
  for (const f of DATASET.flights) {
    const legs = grouped.get(f.tail_id) ?? [];
    legs.push(f);
    grouped.set(f.tail_id, legs);
  }

  const chains: TailChain[] = [];
  for (const [tailId, flights] of grouped) {
    const crew = crewByTail.get(tailId);
    if (!crew) continue; // A tail without an assigned crew cannot be operated.
    chains.push({
      tailId,
      crew,
      flights: [...flights].sort((x, y) => x.leg_order - y.leg_order),
    });
  }
  return chains.sort((a, b) => a.tailId.localeCompare(b.tailId));
})();
