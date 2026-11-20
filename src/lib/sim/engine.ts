import rawDataset from "@/data/domino-sky-dataset.json";
import type {
  AirportClosure,
  CauseStep,
  ConnectionStatus,
  DelayReason,
  DominoDataset,
  Flight,
  FlightStatus,
  NetworkMetrics,
  RecoveryAction,
  SimulatedConnection,
  SimulatedCrew,
  SimulatedFlight,
  SimulationResult,
} from "./types";

export const DATASET: DominoDataset = rawDataset as DominoDataset;

const AIRPORTS_BY_ID = new Map(DATASET.airports.map((a) => [a.id, a]));
const SPARES_BY_ID = new Map(DATASET.spare_aircraft.map((s) => [s.tail_id, s]));
const CREWS_BY_TAIL = new Map(DATASET.crews.map((c) => [c.tail_id, c]));
const CONNECTIONS_BY_ID = new Map(DATASET.connections.map((c) => [c.connection_id, c]));

const TAIL_FLIGHTS: Array<{ tailId: string; flights: Flight[] }> = (() => {
  const grouped = new Map<string, Flight[]>();
  for (const flight of DATASET.flights) {
    const arr = grouped.get(flight.tail_id);
    if (arr) arr.push(flight);
    else grouped.set(flight.tail_id, [flight]);
  }
  return Array.from(grouped.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([tailId, flights]) => ({
      tailId,
      flights: [...flights].sort((x, y) => x.leg_order - y.leg_order),
    }));
})();

export function parseHHMM(hhmm: string): number {
  const [hh, mm] = hhmm.split(":").map(Number);
  return hh * 60 + mm;
}

export function formatHHMM(minutes: number): string {
  const clamped = Math.max(0, Math.round(minutes));
  const hh = Math.floor(clamped / 60) % 24;
  const mm = clamped % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export function getAirportById(airportId: string) {
  return AIRPORTS_BY_ID.get(airportId);
}

function findActiveClosure(
  closures: AirportClosure[],
  airportId: string,
  minute: number
): AirportClosure | undefined {
  return closures.find(
    (c) => c.airportId === airportId && minute >= c.startMin && minute < c.endMin
  );
}

function buildCauseChain(
  flight: SimulatedFlight,
  byId: Record<string, SimulatedFlight>
): CauseStep[] {
  const chain: CauseStep[] = [];
  const visited = new Set<string>();
  let curr: SimulatedFlight | undefined = flight;

  while (curr && !visited.has(curr.flight_id)) {
    visited.add(curr.flight_id);
    if (curr.primaryReason === "NONE") break;

    let summary = "";
    switch (curr.primaryReason) {
      case "PRIMARY_WEATHER_DEP_HOLD":
        summary = `${curr.origin} closed — held departure until ${formatHHMM(curr.actualDepMin)} (+${curr.delayMin}m)`;
        break;
      case "PRIMARY_WEATHER_ARR_HOLD":
        summary = curr.holdingStartMin !== null
          ? `${curr.destination} closed — ATC holding orbit until ${formatHHMM(curr.actualArrMin)} (+${curr.delayMin}m)`
          : `${curr.destination} closed — GDP hold until ${formatHHMM(curr.actualArrMin)} (+${curr.delayMin}m)`;
        break;
      case "LATE_INBOUND_AIRCRAFT":
        summary = `Late inbound ${curr.causeFlightId ?? curr.activeTailId} (${curr.bufferAbsorbedMin > 0 ? `absorbed ${curr.bufferAbsorbedMin}m, ` : ""}+${curr.delayMin}m)`;
        break;
      case "CONNECTION_HOLD":
        summary = `Held for inbound connection ${curr.causeFlightId ?? ""} (+${curr.delayMin}m)`;
        break;
      case "CREW_DUTY_BREACH":
        summary = `${curr.activeCrewId} exceeded 600m duty limit by ${curr.crewOvertimeMin}m`;
        break;
      case "RECOVERY_CANCELLED":
        summary = `Cancelled as recovery action`;
        break;
    }

    chain.unshift({
      flightId: curr.flight_id,
      tailId: curr.activeTailId,
      airportId:
        curr.primaryReason === "PRIMARY_WEATHER_ARR_HOLD"
          ? curr.destination
          : curr.origin,
      reason: curr.primaryReason,
      delayMin: curr.delayMin,
      summary,
    });

    if (
      curr.causeFlightId &&
      curr.causeFlightId !== curr.flight_id &&
      byId[curr.causeFlightId]
    ) {
      curr = byId[curr.causeFlightId];
    } else {
      break;
    }
  }

  return chain;
}

export function simulateNetwork(
  closures: AirportClosure[],
  actions: RecoveryAction[] = []
): SimulationResult {
  const validClosures = closures
    .filter((c) => c.endMin > c.startMin && AIRPORTS_BY_ID.has(c.airportId))
    .map((c) => ({ ...c }))
    .sort((a, b) => a.startMin - b.startMin);

  const minTurnaround = DATASET.meta.min_turnaround_minutes;
  const cancelledIds = new Set<string>();
  const spareSwapByFlightId = new Map<string, string>();
  const holdByFlightId = new Map<
    string,
    Extract<RecoveryAction, { type: "HOLD_CONNECTION" }>
  >();

  for (const action of actions) {
    if (action.type === "CANCEL_FLIGHT") {
      for (const fid of action.flightIds) cancelledIds.add(fid);
    } else if (action.type === "SWAP_SPARE") {
      spareSwapByFlightId.set(action.targetFlightId, action.spareTailId);
    } else if (action.type === "HOLD_CONNECTION") {
      holdByFlightId.set(action.flightId, action);
    }
  }

  let flightsById: Record<string, SimulatedFlight> = {};
  let crewsState: SimulatedCrew[] = [];

  // Fixed-point convergence loop (stabilizes in 2-3 passes for cross-tail connection holds)
  for (let pass = 0; pass < 5; pass++) {
    const prevSnapshot = flightsById;
    const nextById: Record<string, SimulatedFlight> = {};
    const nextCrews: SimulatedCrew[] = [];
    let changed = pass === 0;

    for (const { tailId, flights } of TAIL_FLIGHTS) {
      const baseCrew = CREWS_BY_TAIL.get(tailId)!;
      let activeTailId = tailId;
      let activeCrewId = baseCrew.crew_id;
      let crewDutyStartMin = parseHHMM(baseCrew.duty_start);
      let crewDutyLimitMin = crewDutyStartMin + baseCrew.max_duty_mins;
      let crewBreached = false;
      let crewBreachFlightId: string | null = null;
      let crewMaxProjectedEnd = crewDutyStartMin;
      let crewOvertime = 0;
      let isSpareOperated = false;
      let prevOperatedLeg: SimulatedFlight | null = null;

      // Track original crew stats separately if a spare takes over mid-chain
      let origCrewProjectedEnd = crewDutyStartMin;
      let origCrewBreached = false;
      let origCrewBreachFlightId: string | null = null;
      let origCrewOvertime = 0;

      for (const f of flights) {
        const scheduledDepMin = parseHHMM(f.dep);
        const scheduledArrMin = parseHHMM(f.arr);

        // 1. Recovery cancellation check
        if (cancelledIds.has(f.flight_id)) {
          const simCancelled: SimulatedFlight = {
            ...f,
            activeTailId,
            activeCrewId,
            isSpareOperated,
            scheduledDepMin,
            scheduledArrMin,
            actualDepMin: scheduledDepMin,
            actualArrMin: scheduledArrMin,
            delayMin: 0,
            holdingStartMin: null,
            holdingEndMin: null,
            scheduledTurnaroundMin: prevOperatedLeg
              ? scheduledDepMin - prevOperatedLeg.scheduledArrMin
              : f.turnaround_before_min,
            turnaroundBufferMin: 0,
            bufferAbsorbedMin: 0,
            crewDutyStartMin,
            crewDutyLimitMin,
            crewProjectedDutyMin: 0,
            crewOvertimeMin: 0,
            status: "CANCELLED",
            primaryReason: "RECOVERY_CANCELLED",
            causeFlightId: null,
            rootCauseAirportId: null,
            causeChain: [],
          };
          nextById[f.flight_id] = simCancelled;
          continue;
        }

        // 2. Spare aircraft swap takeover check
        const requestedSpareId = spareSwapByFlightId.get(f.flight_id);
        if (requestedSpareId) {
          const spare = SPARES_BY_ID.get(requestedSpareId);
          if (spare && spare.base === f.origin) {
            if (!isSpareOperated) {
              origCrewProjectedEnd = crewMaxProjectedEnd;
              origCrewBreached = crewBreached;
              origCrewBreachFlightId = crewBreachFlightId;
              origCrewOvertime = crewOvertime;
            }
            activeTailId = spare.tail_id;
            activeCrewId = `RES-${spare.tail_id.slice(-2)}`;
            isSpareOperated = true;
            prevOperatedLeg = null;
            crewBreached = false;
            crewBreachFlightId = null;

            let readyTakeover = Math.max(
              scheduledDepMin,
              parseHHMM(spare.available_from)
            );
            const originClosure = findActiveClosure(
              validClosures,
              f.origin,
              readyTakeover
            );
            if (originClosure) readyTakeover = originClosure.endMin;

            // Standby reserve crew starts 30m briefing before takeover departure
            crewDutyStartMin = readyTakeover - 30;
            crewDutyLimitMin = crewDutyStartMin + 600;
            crewMaxProjectedEnd = crewDutyStartMin;
            crewOvertime = 0;
          }
        }

        // 3. Turnaround propagation & buffer absorption (evaluated BEFORE closures)
        let readyDep = scheduledDepMin;
        let primaryReason: DelayReason = "NONE";
        let causeFlightId: string | null = null;
        let rootCauseAirportId: string | null = null;
        let scheduledTurnaroundMin: number | null = f.turnaround_before_min;
        let turnaroundBufferMin = 0;
        let bufferAbsorbedMin = 0;

        if (prevOperatedLeg) {
          scheduledTurnaroundMin = scheduledDepMin - prevOperatedLeg.scheduledArrMin;
          turnaroundBufferMin = Math.max(0, scheduledTurnaroundMin - minTurnaround);
          const inboundDelay = Math.max(
            0,
            prevOperatedLeg.actualArrMin - prevOperatedLeg.scheduledArrMin
          );
          bufferAbsorbedMin = Math.min(inboundDelay, turnaroundBufferMin);
          const earliestFromInbound = prevOperatedLeg.actualArrMin + minTurnaround;

          if (earliestFromInbound > scheduledDepMin) {
            readyDep = earliestFromInbound;
            primaryReason = "LATE_INBOUND_AIRCRAFT";
            causeFlightId = prevOperatedLeg.flight_id;
            rootCauseAirportId = prevOperatedLeg.rootCauseAirportId;
          }
        }

        // 4. Connection hold recovery action (cross-tail safe via fixed-point loop)
        const holdAction = holdByFlightId.get(f.flight_id);
        if (holdAction) {
          const cx = CONNECTIONS_BY_ID.get(holdAction.connectionId);
          const inboundFlight = cx ? prevSnapshot[cx.from_flight] : undefined;
          if (
            cx &&
            inboundFlight &&
            inboundFlight.status !== "CANCELLED" &&
            inboundFlight.status !== "CREW_BREACH"
          ) {
            const neededDep = inboundFlight.actualArrMin + cx.min_connect_minutes;
            if (neededDep > readyDep) {
              readyDep = neededDep;
              primaryReason = "CONNECTION_HOLD";
              causeFlightId = inboundFlight.flight_id;
              rootCauseAirportId = inboundFlight.rootCauseAirportId;
            }
          }
        }

        // 5. Airport closure holds (evaluated AFTER turnaround so late flights cannot enter/leave closed hubs)
        let actualDepMin = readyDep;
        let actualArrMin = readyDep + f.block_minutes;
        let holdingStartMin: number | null = null;
        let holdingEndMin: number | null = null;

        const maxClosureSteps = validClosures.length * 2 + 2;
        for (let step = 0; step < maxClosureSteps; step++) {
          const depClosure = findActiveClosure(validClosures, f.origin, actualDepMin);
          if (depClosure) {
            actualDepMin = depClosure.endMin;
            actualArrMin = actualDepMin + f.block_minutes;
            holdingStartMin = null;
            holdingEndMin = null;
            primaryReason = "PRIMARY_WEATHER_DEP_HOLD";
            causeFlightId = f.flight_id;
            rootCauseAirportId = f.origin;
            continue;
          }

          const arrClosure = findActiveClosure(
            validClosures,
            f.destination,
            actualArrMin
          );
          if (arrClosure) {
            if (actualDepMin < arrClosure.startMin) {
              // Flight already airborne before destination storm -> ATC holding orbit
              holdingStartMin = actualDepMin + f.block_minutes;
              holdingEndMin = arrClosure.endMin;
              actualArrMin = arrClosure.endMin;
            } else {
              // Ground Delay Program at origin before departure
              const gdpDep = Math.max(
                actualDepMin,
                arrClosure.endMin - f.block_minutes
              );
              actualDepMin = gdpDep;
              actualArrMin = Math.max(
                arrClosure.endMin,
                actualDepMin + f.block_minutes
              );
              holdingStartMin = null;
              holdingEndMin = null;
            }
            primaryReason = "PRIMARY_WEATHER_ARR_HOLD";
            causeFlightId = f.flight_id;
            rootCauseAirportId = f.destination;
            continue;
          }
          break;
        }

        // 6. Crew duty legality (max 600 min from duty_start to actual arrival)
        const crewProjectedDutyMin = actualArrMin - crewDutyStartMin;
        const crewOvertimeMin = Math.max(0, actualArrMin - crewDutyLimitMin);
        const delayMin = Math.max(0, actualArrMin - scheduledArrMin);

        let status: FlightStatus;
        if (crewBreached || actualArrMin > crewDutyLimitMin) {
          crewBreached = true;
          if (!crewBreachFlightId) crewBreachFlightId = f.flight_id;
          crewOvertime = Math.max(crewOvertime, crewOvertimeMin);
          crewMaxProjectedEnd = Math.max(crewMaxProjectedEnd, actualArrMin);
          status = "CREW_BREACH";
          primaryReason = "CREW_DUTY_BREACH";
          // Keep upstream causeFlightId if already delayed by cascade so lineage stays intact
          if (!causeFlightId && prevOperatedLeg) {
            causeFlightId = prevOperatedLeg.flight_id;
            rootCauseAirportId = prevOperatedLeg.rootCauseAirportId;
          }
        } else {
          crewMaxProjectedEnd = Math.max(crewMaxProjectedEnd, actualArrMin);
          status = delayMin > 0 ? "DELAYED" : "ON_TIME";
        }

        const simFlight: SimulatedFlight = {
          ...f,
          activeTailId,
          activeCrewId,
          isSpareOperated,
          scheduledDepMin,
          scheduledArrMin,
          actualDepMin,
          actualArrMin,
          delayMin,
          holdingStartMin,
          holdingEndMin,
          scheduledTurnaroundMin,
          turnaroundBufferMin,
          bufferAbsorbedMin,
          crewDutyStartMin,
          crewDutyLimitMin,
          crewProjectedDutyMin,
          crewOvertimeMin,
          status,
          primaryReason,
          causeFlightId,
          rootCauseAirportId,
          causeChain: [],
        };

        nextById[f.flight_id] = simFlight;
        if (status !== "CREW_BREACH") {
          prevOperatedLeg = simFlight;
        }

        const prevFlight = prevSnapshot[f.flight_id];
        if (
          !prevFlight ||
          prevFlight.actualDepMin !== simFlight.actualDepMin ||
          prevFlight.actualArrMin !== simFlight.actualArrMin ||
          prevFlight.status !== simFlight.status
        ) {
          changed = true;
        }
      }

      if (isSpareOperated) {
        nextCrews.push({
          crewId: baseCrew.crew_id,
          tailId: baseCrew.tail_id,
          base: baseCrew.base,
          dutyStartMin: parseHHMM(baseCrew.duty_start),
          dutyLimitMin: parseHHMM(baseCrew.duty_start) + baseCrew.max_duty_mins,
          projectedEndMin: origCrewProjectedEnd,
          breached: origCrewBreached,
          breachFlightId: origCrewBreachFlightId,
          overtimeMin: origCrewOvertime,
        });
      } else {
        nextCrews.push({
          crewId: baseCrew.crew_id,
          tailId: baseCrew.tail_id,
          base: baseCrew.base,
          dutyStartMin: crewDutyStartMin,
          dutyLimitMin: crewDutyLimitMin,
          projectedEndMin: crewMaxProjectedEnd,
          breached: crewBreached,
          breachFlightId: crewBreachFlightId,
          overtimeMin: crewOvertime,
        });
      }
    }

    flightsById = nextById;
    crewsState = nextCrews;
    if (!changed) break;
  }

  // Populate causal domino chains in dataset order
  const flights = DATASET.flights.map((f) => {
    const sf = flightsById[f.flight_id];
    sf.causeChain = buildCauseChain(sf, flightsById);
    return sf;
  });

  // Evaluate all 21 passenger connections + inclusion-exclusion stranded totals
  const connections: SimulatedConnection[] = DATASET.connections.map((cx) => {
    const fromF = flightsById[cx.from_flight];
    const toF = flightsById[cx.to_flight];
    const fromGrounded =
      fromF.status === "CANCELLED" || fromF.status === "CREW_BREACH";
    const toGrounded =
      toF.status === "CANCELLED" || toF.status === "CREW_BREACH";
    const isDualGrounded = fromGrounded && toGrounded;

    if (fromGrounded || toGrounded) {
      return {
        ...cx,
        status: "BROKEN_GROUNDED" as ConnectionStatus,
        actualConnectMin: null,
        shortfallMin: cx.min_connect_minutes,
        isDualGrounded,
      };
    }

    const actualConnectMin = toF.actualDepMin - fromF.actualArrMin;
    if (actualConnectMin < cx.min_connect_minutes) {
      return {
        ...cx,
        status: "BROKEN_TIME" as ConnectionStatus,
        actualConnectMin,
        shortfallMin: cx.min_connect_minutes - actualConnectMin,
        isDualGrounded: false,
      };
    }

    return {
      ...cx,
      status: "INTACT" as ConnectionStatus,
      actualConnectMin,
      shortfallMin: 0,
      isDualGrounded: false,
    };
  });

  let onTimeFlights = 0;
  let delayedFlights = 0;
  let crewBreaches = 0;
  let cancelledFlights = 0;
  let totalDelayMinutes = 0;
  let maxDelayMinutes = 0;
  let groundedPax = 0;
  const affectedAirports = new Set<string>();
  const affectedTails = new Set<string>();
  const sparesUsed = new Set<string>();

  for (const f of flights) {
    if (f.isSpareOperated) sparesUsed.add(f.activeTailId);
    if (f.status === "ON_TIME") {
      onTimeFlights++;
    } else if (f.status === "DELAYED") {
      delayedFlights++;
      totalDelayMinutes += f.delayMin;
      if (f.delayMin > maxDelayMinutes) maxDelayMinutes = f.delayMin;
      affectedAirports.add(f.origin);
      affectedAirports.add(f.destination);
      affectedTails.add(f.tail_id);
    } else if (f.status === "CREW_BREACH") {
      crewBreaches++;
      groundedPax += f.pax;
      affectedAirports.add(f.origin);
      affectedAirports.add(f.destination);
      affectedTails.add(f.tail_id);
    } else if (f.status === "CANCELLED") {
      cancelledFlights++;
      groundedPax += f.pax;
      affectedAirports.add(f.origin);
      affectedAirports.add(f.destination);
      affectedTails.add(f.tail_id);
    }
  }

  let brokenConnections = 0;
  let dualGroundedOverlapPax = 0;
  let missedConnectionPax = 0;
  for (const cx of connections) {
    if (cx.status !== "INTACT") brokenConnections++;
    if (cx.isDualGrounded) dualGroundedOverlapPax += cx.passengers;
    if (cx.status === "BROKEN_TIME") missedConnectionPax += cx.passengers;
  }

  const totalStrandedPax =
    groundedPax - dualGroundedOverlapPax + missedConnectionPax;

  const metrics: NetworkMetrics = {
    totalFlights: flights.length,
    onTimeFlights,
    delayedFlights,
    crewBreaches,
    cancelledFlights,
    totalDelayMinutes,
    maxDelayMinutes,
    brokenConnections,
    groundedPax,
    dualGroundedOverlapPax,
    missedConnectionPax,
    totalStrandedPax,
    affectedAirports: Array.from(affectedAirports).sort(),
    affectedTails: Array.from(affectedTails).sort(),
    sparesUsed: Array.from(sparesUsed).sort(),
  };

  return {
    closures: validClosures,
    actions,
    flights,
    flightsById,
    connections,
    crews: crewsState,
    metrics,
  };
}
