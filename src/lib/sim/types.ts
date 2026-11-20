export type AirportTier = "mega_hub" | "regional_hub" | "spoke";

export interface Airport {
  id: string;
  name: string;
  city: string;
  lat: number;
  lng: number;
  tier: AirportTier;
  capacity_per_hour: number;
}

export interface Flight {
  flight_id: string;
  tail_id: string;
  leg_order: number;
  origin: string;
  destination: string;
  dep: string;
  arr: string;
  block_minutes: number;
  pax: number;
  turnaround_before_min: number | null;
}

export interface Connection {
  connection_id: string;
  airport: string;
  from_flight: string;
  to_flight: string;
  passengers: number;
  min_connect_minutes: number;
}

export interface Crew {
  crew_id: string;
  tail_id: string;
  base: string;
  duty_start: string;
  max_duty_mins: number;
  flight_ids: string[];
}

export interface SpareAircraft {
  tail_id: string;
  base: string;
  available_from: string;
  seats: number;
}

export interface DominoDataset {
  meta: {
    dataset: string;
    operating_day: string;
    min_turnaround_minutes: number;
    seats_per_aircraft: number;
    notes: string[];
  };
  airports: Airport[];
  flights: Flight[];
  connections: Connection[];
  crews: Crew[];
  spare_aircraft: SpareAircraft[];
}

export interface AirportClosure {
  id: string;
  airportId: string;
  startMin: number;
  endMin: number;
  label?: string;
}

export type RecoveryAction =
  | {
      id: string;
      type: "SWAP_SPARE";
      spareTailId: string;
      targetFlightId: string;
      label: string;
    }
  | {
      id: string;
      type: "CANCEL_FLIGHT";
      flightIds: string[];
      label: string;
    }
  | {
      id: string;
      type: "HOLD_CONNECTION";
      connectionId: string;
      flightId: string;
      holdMinutes: number;
      label: string;
    };

export type FlightStatus = "ON_TIME" | "DELAYED" | "CREW_BREACH" | "CANCELLED";

export type DelayReason =
  | "NONE"
  | "PRIMARY_WEATHER_DEP_HOLD"
  | "PRIMARY_WEATHER_ARR_HOLD"
  | "LATE_INBOUND_AIRCRAFT"
  | "CONNECTION_HOLD"
  | "CREW_DUTY_BREACH"
  | "RECOVERY_CANCELLED";

export interface CauseStep {
  flightId: string;
  tailId: string;
  airportId: string;
  reason: DelayReason;
  delayMin: number;
  summary: string;
}

export interface SimulatedFlight extends Flight {
  activeTailId: string;
  activeCrewId: string;
  isSpareOperated: boolean;
  scheduledDepMin: number;
  scheduledArrMin: number;
  actualDepMin: number;
  actualArrMin: number;
  delayMin: number;
  holdingStartMin: number | null;
  holdingEndMin: number | null;
  scheduledTurnaroundMin: number | null;
  turnaroundBufferMin: number;
  bufferAbsorbedMin: number;
  crewDutyStartMin: number;
  crewDutyLimitMin: number;
  crewProjectedDutyMin: number;
  crewOvertimeMin: number;
  status: FlightStatus;
  primaryReason: DelayReason;
  causeFlightId: string | null;
  rootCauseAirportId: string | null;
  causeChain: CauseStep[];
}

export type ConnectionStatus = "INTACT" | "BROKEN_TIME" | "BROKEN_GROUNDED";

export interface SimulatedConnection extends Connection {
  status: ConnectionStatus;
  actualConnectMin: number | null;
  shortfallMin: number;
  isDualGrounded: boolean;
}

export interface SimulatedCrew {
  crewId: string;
  tailId: string;
  base: string;
  dutyStartMin: number;
  dutyLimitMin: number;
  projectedEndMin: number;
  breached: boolean;
  breachFlightId: string | null;
  overtimeMin: number;
}

export interface NetworkMetrics {
  totalFlights: number;
  onTimeFlights: number;
  delayedFlights: number;
  crewBreaches: number;
  cancelledFlights: number;
  totalDelayMinutes: number;
  maxDelayMinutes: number;
  brokenConnections: number;
  groundedPax: number;
  dualGroundedOverlapPax: number;
  missedConnectionPax: number;
  totalStrandedPax: number;
  affectedAirports: string[];
  affectedTails: string[];
  sparesUsed: string[];
}

export interface SimulationResult {
  closures: AirportClosure[];
  actions: RecoveryAction[];
  flights: SimulatedFlight[];
  flightsById: Record<string, SimulatedFlight>;
  connections: SimulatedConnection[];
  crews: SimulatedCrew[];
  metrics: NetworkMetrics;
}

export interface RecoveryDeltas {
  strandedPaxDelta: number;
  crewBreachesDelta: number;
  delayedFlightsDelta: number;
  totalDelayMinutesDelta: number;
  savedConnections: number;
}

export interface RecoveryCandidate {
  id: string;
  title: string;
  category: "SPARE" | "CANCEL" | "HOLD" | "COMBO";
  actions: RecoveryAction[];
  result: SimulationResult;
  deltas: RecoveryDeltas;
}

export interface RecoveryEvaluation {
  closures: AirportClosure[];
  baseline: SimulationResult;
  candidates: RecoveryCandidate[];
}

export interface DispatcherOptionNote {
  candidateId: string;
  rationale: string;
  tradeoff: string;
}

export interface DispatcherBriefing {
  recommendedCandidateId: string | null;
  executiveSummary: string;
  tradeoffAnalysis: string;
  optionNotes: DispatcherOptionNote[];
}
