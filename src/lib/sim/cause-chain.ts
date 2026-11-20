/**
 * Causal "domino" lineage for a simulated flight.
 *
 * Follows `causeFlightId` links upstream to explain why a leg is late, producing
 * human-readable steps consumed by the radar overlay, inspector and AI prompts.
 */

import { MAX_CREW_DUTY_MIN, formatHHMM } from "./constants";
import type { CauseStep, SimulatedFlight } from "./types";

function summarizeCause(c: SimulatedFlight): string {
  const delay = `+${c.delayMin}m`;
  switch (c.primaryReason) {
    case "PRIMARY_WEATHER_DEP_HOLD":
      return `${c.origin} closed — held departure until ${formatHHMM(c.actualDepMin)} (${delay})`;
    case "PRIMARY_WEATHER_ARR_HOLD": {
      const mode = c.holdingStartMin !== null ? "ATC holding orbit" : "GDP hold";
      return `${c.destination} closed — ${mode} until ${formatHHMM(c.actualArrMin)} (${delay})`;
    }
    case "LATE_INBOUND_AIRCRAFT": {
      const absorbed = c.bufferAbsorbedMin > 0 ? `absorbed ${c.bufferAbsorbedMin}m, ` : "";
      return `Late inbound ${c.causeFlightId ?? c.activeTailId} (${absorbed}${delay})`;
    }
    case "CONNECTION_HOLD":
      return `Held for inbound connection ${c.causeFlightId ?? ""} (${delay})`;
    case "CREW_DUTY_BREACH":
      return `${c.activeCrewId} exceeded ${MAX_CREW_DUTY_MIN}m duty limit by ${c.crewOvertimeMin}m`;
    case "RECOVERY_CANCELLED":
      return "Cancelled as recovery action";
    default:
      return "";
  }
}

/**
 * Builds the ordered domino chain for a flight (root cause first, `flight` last).
 * A visited set guards against accidental cycles in `causeFlightId` links.
 *
 * @param flight - Leg whose lineage is requested.
 * @param byId - All simulated flights keyed by id.
 * @returns Ordered causal steps; empty for on-time legs.
 */
export function buildCauseChain(
  flight: SimulatedFlight,
  byId: Record<string, SimulatedFlight>
): CauseStep[] {
  const chain: CauseStep[] = [];
  const visited = new Set<string>();
  let curr: SimulatedFlight | undefined = flight;

  while (curr && !visited.has(curr.flight_id) && curr.primaryReason !== "NONE") {
    visited.add(curr.flight_id);
    chain.unshift({
      flightId: curr.flight_id,
      tailId: curr.activeTailId,
      airportId:
        curr.primaryReason === "PRIMARY_WEATHER_ARR_HOLD" ? curr.destination : curr.origin,
      reason: curr.primaryReason,
      delayMin: curr.delayMin,
      summary: summarizeCause(curr),
    });
    const upstreamId: string | null = curr.causeFlightId;
    curr = upstreamId && upstreamId !== curr.flight_id ? byId[upstreamId] : undefined;
  }
  return chain;
}
