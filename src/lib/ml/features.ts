import { DATASET, parseHHMM } from "../sim/engine";
import type { AirportClosure, SimulationResult } from "../sim/types";

export const FEATURE_NAMES = [
  "activeFlightsInWindow",
  "tightTurnaroundCount",
  "connectingPaxExposed",
  "minCrewMarginMins",
  "hourOfDay",
  "stormDurationMins",
  "bufferShatterLoad",
  "closureFlightImpact",
  "downstreamLegsExposed",
] as const;

export const FEATURE_LABELS: Record<(typeof FEATURE_NAMES)[number], string> = {
  activeFlightsInWindow: "Flights in storm window",
  tightTurnaroundCount: "Tight turnarounds (<=40m)",
  connectingPaxExposed: "Hub connection load",
  minCrewMarginMins: "Crew duty slack margin",
  hourOfDay: "Time-of-day peak",
  stormDurationMins: "Closure duration",
  bufferShatterLoad: "Turnaround cliff exposure",
  closureFlightImpact: "Duration × flights wave",
  downstreamLegsExposed: "Downstream tail legs",
};

const CREWS_BY_TAIL = new Map(DATASET.crews.map((c) => [c.tail_id, c]));
const TAIL_LEGS = (() => {
  const m = new Map<string, typeof DATASET.flights>();
  for (const f of DATASET.flights) {
    const arr = m.get(f.tail_id);
    if (arr) arr.push(f);
    else m.set(f.tail_id, [f]);
  }
  return m;
})();

export function extractRiskFeatures(
  closures: AirportClosure[],
  simulation?: SimulationResult
): number[] {
  if (closures.length === 0) {
    return [0, 0, 0, 300, 12, 0, 0, 0, 0];
  }

  const touchedFlightIds = new Set<string>();
  const touchedTails = new Set<string>();
  let activeFlightsInWindow = 0;

  for (const f of DATASET.flights) {
    const depMin = parseHHMM(f.dep);
    const arrMin = parseHHMM(f.arr);
    const hits = closures.some(
      (c) =>
        (f.origin === c.airportId && depMin >= c.startMin && depMin < c.endMin) ||
        (f.destination === c.airportId && arrMin >= c.startMin && arrMin < c.endMin)
    );
    if (hits) {
      activeFlightsInWindow++;
      touchedFlightIds.add(f.flight_id);
      touchedTails.add(f.tail_id);
    }
  }

  // Also include any already-disrupted flights in live simulation state
  if (simulation) {
    for (const f of simulation.flights) {
      if (f.status !== "ON_TIME") {
        touchedFlightIds.add(f.flight_id);
        touchedTails.add(f.tail_id);
      }
    }
  }

  let tightTurnaroundCount = 0;
  let minCrewMarginMins = 300;

  for (const tailId of touchedTails) {
    const legs = TAIL_LEGS.get(tailId) ?? [];
    let maxSchedArr = 0;
    for (const l of legs) {
      if (l.turnaround_before_min !== null && l.turnaround_before_min <= 40) {
        tightTurnaroundCount++;
      }
      const arrMin = parseHHMM(l.arr);
      if (arrMin > maxSchedArr) maxSchedArr = arrMin;
    }

    const crew = CREWS_BY_TAIL.get(tailId);
    if (crew) {
      const limit = parseHHMM(crew.duty_start) + crew.max_duty_mins;
      const liveCrew = simulation?.crews.find((c) => c.crewId === crew.crew_id);
      const endMin = liveCrew ? liveCrew.projectedEndMin : maxSchedArr;
      const margin = Math.max(0, Math.min(300, limit - endMin));
      if (margin < minCrewMarginMins) minCrewMarginMins = margin;
    }
  }

  let connectingPaxExposed = 0;
  for (const cx of DATASET.connections) {
    const fromFlight = DATASET.flights.find((f) => f.flight_id === cx.from_flight);
    const toFlight = DATASET.flights.find((f) => f.flight_id === cx.to_flight);
    if (
      touchedFlightIds.has(cx.from_flight) ||
      touchedFlightIds.has(cx.to_flight) ||
      (fromFlight && touchedTails.has(fromFlight.tail_id)) ||
      (toFlight && touchedTails.has(toFlight.tail_id))
    ) {
      connectingPaxExposed += cx.passengers;
    }
  }

  const earliestStart = Math.min(...closures.map((c) => c.startMin));
  const totalDuration = closures.reduce((acc, c) => acc + (c.endMin - c.startMin), 0);
  const avgDuration = totalDuration / closures.length;
  const bufferShatterLoad = Math.max(0, avgDuration - 35) * tightTurnaroundCount;
  const closureFlightImpact = activeFlightsInWindow * (avgDuration / 60);

  let downstreamLegsExposed = 0;
  for (const tailId of touchedTails) {
    const legs = TAIL_LEGS.get(tailId) ?? [];
    for (const l of legs) {
      if (parseHHMM(l.dep) >= earliestStart) downstreamLegsExposed++;
    }
  }

  return [
    activeFlightsInWindow,
    tightTurnaroundCount,
    connectingPaxExposed,
    minCrewMarginMins,
    Math.round((earliestStart / 60) * 100) / 100,
    totalDuration,
    Math.round(bufferShatterLoad * 100) / 100,
    Math.round(closureFlightImpact * 100) / 100,
    downstreamLegsExposed,
  ];
}
