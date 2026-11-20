"use client";

import {
  ArrowRight,
  CheckCircle2,
  Clock,
  ShieldAlert,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { formatHHMM } from "@/lib/sim/engine";
import type { SimulatedConnection, SimulatedFlight } from "@/lib/sim/types";

interface FlightInspectorProps {
  flight: SimulatedFlight;
  connections: SimulatedConnection[];
  onSelectFlight: (flightId: string) => void;
  onClose: () => void;
}

export function FlightInspector({
  flight,
  connections,
  onSelectFlight,
  onClose,
}: FlightInspectorProps) {
  const relatedConnections = connections.filter(
    (c) =>
      c.from_flight === flight.flight_id || c.to_flight === flight.flight_id
  );

  const dutyUsedPct = Math.min(
    100,
    Math.max(0, Math.round((flight.crewProjectedDutyMin / 600) * 100))
  );

  return (
    <aside
      aria-label={`Flight telemetry for ${flight.flight_id}`}
      className="absolute left-3 top-20 z-20 max-h-[calc(100%-140px)] w-80 overflow-y-auto rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] p-3.5 shadow-lg"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-bold text-[#0F172A]">
              {flight.flight_id}
            </span>
            <span className="rounded-sm border border-[#E2E8F0] bg-[#F8FAFC] px-1.5 py-0.5 font-mono text-[10px] font-medium text-[#475569]">
              {flight.activeTailId} · Leg {flight.leg_order}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 font-mono text-xs text-[#475569]">
            <span className="font-semibold text-[#0F172A]">{flight.origin}</span>
            <ArrowRight className="h-3 w-3" aria-hidden="true" />
            <span className="font-semibold text-[#0F172A]">
              {flight.destination}
            </span>
            <span>·</span>
            <Users className="h-3 w-3" aria-hidden="true" />
            <span>{flight.pax} pax</span>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close flight inspector"
          className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A]"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      {/* Status Row */}
      <div className="mt-3 flex items-center justify-between border-y border-[#E2E8F0] py-2">
        <StatusTag flight={flight} />
        <div className="text-right font-mono text-[11px] tabular-nums">
          <div className="text-[#475569]">
            Sched {flight.dep}–{flight.arr}
          </div>
          {flight.status !== "CANCELLED" && (
            <div
              className={
                flight.delayMin > 0
                  ? "font-semibold text-[#B45309]"
                  : "font-semibold text-[#059669]"
              }
            >
              Actual {formatHHMM(flight.actualDepMin)}–
              {formatHHMM(flight.actualArrMin)}
            </div>
          )}
        </div>
      </div>

      {/* Turnaround Buffer Absorption */}
      {flight.scheduledTurnaroundMin !== null && (
        <div className="mt-2.5 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-2.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-medium text-[#475569]">
              Turnaround slack (30m min)
            </span>
            <span className="font-mono tabular-nums text-[#0F172A]">
              {flight.scheduledTurnaroundMin}m ({flight.turnaroundBufferMin}m
              slack)
            </span>
          </div>
          {flight.bufferAbsorbedMin > 0 ? (
            <p className="mt-1 font-mono text-[11px] font-semibold text-[#059669]">
              Absorbed {flight.bufferAbsorbedMin}m inbound delay
              {flight.delayMin === 0 ? " — downstream clean" : ""}
            </p>
          ) : (
            <p className="mt-1 font-mono text-[11px] text-[#475569]">
              {flight.delayMin > 0 &&
              flight.primaryReason === "LATE_INBOUND_AIRCRAFT"
                ? `Buffer exhausted — +${flight.delayMin}m passed downstream`
                : `${flight.turnaroundBufferMin}m slack available`}
            </p>
          )}
        </div>
      )}

      {/* Crew Duty Clock */}
      <div className="mt-2.5 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-2.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-medium text-[#475569]">
            Crew {flight.activeCrewId} duty (600m max)
          </span>
          <span
            className={`font-mono font-semibold tabular-nums ${
              flight.crewOvertimeMin > 0 ? "text-[#DC2626]" : "text-[#0F172A]"
            }`}
          >
            {flight.crewProjectedDutyMin}m / 600m
            {flight.crewOvertimeMin > 0 ? ` (+${flight.crewOvertimeMin}m)` : ""}
          </span>
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[#E2E8F0]">
          <div
            className={`h-full ${
              flight.crewOvertimeMin > 0
                ? "bg-[#DC2626]"
                : dutyUsedPct >= 92
                  ? "bg-[#D97706]"
                  : "bg-[#2563EB]"
            }`}
            style={{ width: `${dutyUsedPct}%` }}
          />
        </div>
      </div>

      {/* Causal Domino Lineage */}
      {flight.causeChain.length > 0 && (
        <div className="mt-3">
          <div className="text-xs font-semibold text-[#0F172A]">
            Causal domino chain
          </div>
          <ol className="mt-1.5 space-y-1.5">
            {flight.causeChain.map((step, idx) => (
              <li key={`${step.flightId}-${idx}`}>
                <button
                  type="button"
                  onClick={() => onSelectFlight(step.flightId)}
                  className="w-full cursor-pointer rounded-md border border-[#E2E8F0] bg-[#F8FAFC] px-2.5 py-1.5 text-left transition-colors duration-150 hover:border-[#2563EB]/40 hover:bg-[#EFF6FF]"
                >
                  <div className="flex items-center justify-between font-mono text-[11px]">
                    <span className="font-semibold text-[#2563EB]">
                      Hop {idx + 1}: {step.flightId} ({step.airportId})
                    </span>
                    {step.delayMin > 0 && (
                      <span className="font-semibold text-[#DC2626]">
                        +{step.delayMin}m
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] leading-snug text-[#475569]">
                    {step.summary}
                  </p>
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Passenger Connections */}
      {relatedConnections.length > 0 && (
        <div className="mt-3">
          <div className="text-xs font-semibold text-[#0F172A]">
            Passenger connections
          </div>
          <div className="mt-1.5 space-y-1">
            {relatedConnections.map((cx) => (
              <div
                key={cx.connection_id}
                className="flex items-center justify-between rounded-md border border-[#E2E8F0] bg-[#F8FAFC] px-2 py-1 text-[11px]"
              >
                <span className="font-mono text-[#0F172A]">
                  {cx.connection_id}: {cx.from_flight}→{cx.to_flight} (
                  {cx.passengers}p)
                </span>
                <span
                  className={`font-mono font-semibold ${
                    cx.status === "INTACT"
                      ? "text-[#059669]"
                      : "text-[#DC2626]"
                  }`}
                >
                  {cx.status === "INTACT"
                    ? `${cx.actualConnectMin}m OK`
                    : cx.status === "BROKEN_GROUNDED"
                      ? "GROUNDED"
                      : `-${cx.shortfallMin}m MISSED`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}

function StatusTag({ flight }: { flight: SimulatedFlight }) {
  if (flight.status === "ON_TIME") {
    return (
      <span className="inline-flex items-center gap-1 rounded-sm border border-[#059669]/30 bg-[#ECFDF5] px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[#059669]">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
        ON TIME
      </span>
    );
  }
  if (flight.status === "DELAYED") {
    return (
      <span className="inline-flex items-center gap-1 rounded-sm border border-[#D97706]/30 bg-[#FEF3C7] px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[#B45309]">
        <Clock className="h-3.5 w-3.5" aria-hidden="true" />
        +{flight.delayMin}m {flight.holdingStartMin !== null ? "HOLD" : "DELAY"}
      </span>
    );
  }
  if (flight.status === "CREW_BREACH") {
    return (
      <span className="inline-flex items-center gap-1 rounded-sm border border-[#DC2626]/30 bg-[#FEE2E2] px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[#DC2626]">
        <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
        CREW BREACH
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-sm border border-[#CBD5E1] bg-[#F1F5F9] px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[#475569]">
      <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
      CANCELLED
    </span>
  );
}
