/**
 * Passenger-connection evaluation and network-wide KPI aggregation.
 *
 * Both functions are pure post-processing over an already converged flight
 * schedule produced by `simulateNetwork`. Stranded passengers are counted with
 * inclusion-exclusion so a connection whose two legs are both grounded is never
 * double counted.
 */

import { DATASET } from "./constants";
import type {
  NetworkMetrics,
  SimulatedConnection,
  SimulatedFlight,
} from "./types";

/** A leg that can no longer carry passengers (recovery cancel or crew duty breach). */
function isGrounded(flight: SimulatedFlight): boolean {
  return flight.status === "CANCELLED" || flight.status === "CREW_BREACH";
}

/**
 * Classifies every dataset passenger connection against the simulated schedule.
 *
 * @param flightsById - Converged simulated flights keyed by `flight_id`.
 * @returns One `SimulatedConnection` per dataset connection, in dataset order.
 */
export function evaluateConnections(
  flightsById: Record<string, SimulatedFlight>
): SimulatedConnection[] {
  return DATASET.connections.map((cx): SimulatedConnection => {
    const fromFlight = flightsById[cx.from_flight];
    const toFlight = flightsById[cx.to_flight];
    const fromGrounded = isGrounded(fromFlight);
    const toGrounded = isGrounded(toFlight);

    if (fromGrounded || toGrounded) {
      return {
        ...cx,
        status: "BROKEN_GROUNDED",
        actualConnectMin: null,
        shortfallMin: cx.min_connect_minutes,
        isDualGrounded: fromGrounded && toGrounded,
      };
    }

    const actualConnectMin = toFlight.actualDepMin - fromFlight.actualArrMin;
    const broken = actualConnectMin < cx.min_connect_minutes;
    return {
      ...cx,
      status: broken ? "BROKEN_TIME" : "INTACT",
      actualConnectMin,
      shortfallMin: broken ? cx.min_connect_minutes - actualConnectMin : 0,
      isDualGrounded: false,
    };
  });
}

/** Per-flight tallies gathered in a single pass over the schedule. */
interface FlightTally {
  onTimeFlights: number;
  delayedFlights: number;
  crewBreaches: number;
  cancelledFlights: number;
  totalDelayMinutes: number;
  maxDelayMinutes: number;
  groundedPax: number;
  affectedAirports: Set<string>;
  affectedTails: Set<string>;
  sparesUsed: Set<string>;
}

function tallyFlights(flights: SimulatedFlight[]): FlightTally {
  const tally: FlightTally = {
    onTimeFlights: 0,
    delayedFlights: 0,
    crewBreaches: 0,
    cancelledFlights: 0,
    totalDelayMinutes: 0,
    maxDelayMinutes: 0,
    groundedPax: 0,
    affectedAirports: new Set(),
    affectedTails: new Set(),
    sparesUsed: new Set(),
  };

  for (const f of flights) {
    if (f.isSpareOperated) tally.sparesUsed.add(f.activeTailId);
    if (f.status === "ON_TIME") {
      tally.onTimeFlights++;
      continue;
    }
    // Every non-on-time leg marks its endpoints and its scheduled tail as affected.
    tally.affectedAirports.add(f.origin);
    tally.affectedAirports.add(f.destination);
    tally.affectedTails.add(f.tail_id);

    if (f.status === "DELAYED") {
      tally.delayedFlights++;
      tally.totalDelayMinutes += f.delayMin;
      tally.maxDelayMinutes = Math.max(tally.maxDelayMinutes, f.delayMin);
    } else {
      if (f.status === "CREW_BREACH") tally.crewBreaches++;
      else tally.cancelledFlights++;
      tally.groundedPax += f.pax;
    }
  }
  return tally;
}

/**
 * Rolls a simulated schedule up into network KPIs.
 *
 * `totalDelayMinutes` counts only operated (DELAYED) legs; grounded legs are
 * reported through `groundedPax` instead of delay minutes.
 *
 * @param flights - Simulated flights in dataset order.
 * @param connections - Evaluated passenger connections.
 * @returns Aggregated `NetworkMetrics` with sorted affected-entity lists.
 */
export function aggregateNetworkMetrics(
  flights: SimulatedFlight[],
  connections: SimulatedConnection[]
): NetworkMetrics {
  const t = tallyFlights(flights);

  let brokenConnections = 0;
  let dualGroundedOverlapPax = 0;
  let missedConnectionPax = 0;
  for (const cx of connections) {
    if (cx.status !== "INTACT") brokenConnections++;
    if (cx.isDualGrounded) dualGroundedOverlapPax += cx.passengers;
    if (cx.status === "BROKEN_TIME") missedConnectionPax += cx.passengers;
  }

  return {
    totalFlights: flights.length,
    onTimeFlights: t.onTimeFlights,
    delayedFlights: t.delayedFlights,
    crewBreaches: t.crewBreaches,
    cancelledFlights: t.cancelledFlights,
    totalDelayMinutes: t.totalDelayMinutes,
    maxDelayMinutes: t.maxDelayMinutes,
    brokenConnections,
    groundedPax: t.groundedPax,
    dualGroundedOverlapPax,
    missedConnectionPax,
    totalStrandedPax:
      t.groundedPax - dualGroundedOverlapPax + missedConnectionPax,
    affectedAirports: Array.from(t.affectedAirports).sort(),
    affectedTails: Array.from(t.affectedTails).sort(),
    sparesUsed: Array.from(t.sparesUsed).sort(),
  };
}
