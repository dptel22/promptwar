"use client";

import {
  AlertTriangle,
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
      className="absolute left-3 top-3 z-20 max-h-[calc(100%-84px)] w-80 overflow-y-auto rounded-lg border border-[#222C38] bg-[#11161D] p-3.5 shadow-xl"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-bold text-[#F1F5F9]">
              {flight.flight_id}
            </span>
            <span className="rounded-sm border border-[#222C38] bg-[#18202A] px-1.5 py-0.5 font-mono text-[10px] text-[#94A3B8]">
              {flight.activeTailId} · Leg {flight.leg_order}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 font-mono text-xs text-[#94A3B8]">
            <span className="font-semibold text-[#F1F5F9]">{flight.origin}</span>
            <ArrowRight className="h-3 w-3" aria-hidden="true" />
            <span className="font-semibold text-[#F1F5F9]">
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
          className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border border-[#222C38] bg-[#18202A] text-[#94A3B8] hover:text-[#F1F5F9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      {/* Status Banner (Color + Icon + Text) */}
      <div className="mt-2.5 flex items-center justify-between rounded-md border border-[#222C38] bg-[#18202A] px-2.5 py-2">
        <StatusTag flight={flight} />
        <div className="text-right font-mono text-[11px] tabular-nums">
          <div className="text-[#94A3B8]">
            Sched {flight.dep}–{flight.arr}
          </div>
          {flight.status !== "CANCELLED" && (
            <div
              className={
                flight.delayMin > 0 ? "font-semibold text-[#FBBF24]" : "text-[#34D399]"
              }
            >
              Actual {formatHHMM(flight.actualDepMin)}–
              {formatHHMM(flight.actualArrMin)}
            </div>
          )}
        </div>
      </div>

      {/* Turnaround Buffer Absorption Gauge (Proves Stress Test #1) */}
      {flight.scheduledTurnaroundMin !== null && (
        <div className="mt-2.5 rounded-md border border-[#222C38] bg-[#090D12] p-2.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-medium text-[#94A3B8]">
              Turnaround Slack (30m min)
            </span>
            <span className="font-mono tabular-nums text-[#F1F5F9]">
              {flight.scheduledTurnaroundMin}m sched ({flight.turnaroundBufferMin}m
              buffer)
            </span>
          </div>
          {flight.bufferAbsorbedMin > 0 ? (
            <p className="mt-1 font-mono text-[11px] font-medium text-[#34D399]">
              Absorbed {flight.bufferAbsorbedMin}m inbound delay
              {flight.delayMin === 0 ? " — downstream clean" : ""}
            </p>
          ) : (
            <p className="mt-1 font-mono text-[11px] text-[#94A3B8]">
              {flight.delayMin > 0 && flight.primaryReason === "LATE_INBOUND_AIRCRAFT"
                ? `Buffer exhausted — +${flight.delayMin}m passed downstream`
                : `${flight.turnaroundBufferMin}m slack available`}
            </p>
          )}
        </div>
      )}

      {/* Crew Duty Clock Meter */}
      <div className="mt-2.5 rounded-md border border-[#222C38] bg-[#090D12] p-2.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-medium text-[#94A3B8]">
            Crew {flight.activeCrewId} Duty (600m max)
          </span>
          <span
            className={`font-mono font-semibold tabular-nums ${
              flight.crewOvertimeMin > 0 ? "text-[#F87171]" : "text-[#F1F5F9]"
            }`}
          >
            {flight.crewProjectedDutyMin}m / 600m
            {flight.crewOvertimeMin > 0 ? ` (+${flight.crewOvertimeMin}m!)` : ""}
          </span>
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-sm bg-[#18202A]">
          <div
            className={`h-full ${
              flight.crewOvertimeMin > 0
                ? "bg-[#EF4444]"
                : dutyUsedPct >= 92
                  ? "bg-[#F59E0B]"
                  : "bg-[#10B981]"
            }`}
            style={{ width: `${dutyUsedPct}%` }}
          />
        </div>
      </div>

      {/* Causal Domino Lineage */}
      {flight.causeChain.length > 0 && (
        <div className="mt-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">
            Why This Flight Is Disrupted
          </h3>
          <ol className="mt-1.5 space-y-1.5">
            {flight.causeChain.map((step, idx) => (
              <li key={`${step.flightId}-${idx}`}>
                <button
                  type="button"
                  onClick={() => onSelectFlight(step.flightId)}
                  className="w-full cursor-pointer rounded-md border border-[#222C38] bg-[#18202A] px-2.5 py-1.5 text-left transition-colors duration-150 hover:border-amber-500/50 hover:bg-[#1F2937] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                >
                  <div className="flex items-center justify-between font-mono text-[11px]">
                    <span className="font-semibold text-[#FBBF24]">
                      Hop {idx + 1}: {step.flightId} ({step.airportId})
                    </span>
                    {step.delayMin > 0 && (
                      <span className="text-[#F87171]">+{step.delayMin}m</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] leading-snug text-[#94A3B8]">
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
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">
            Passenger Connections
          </h3>
          <div className="mt-1.5 space-y-1">
            {relatedConnections.map((cx) => (
              <div
                key={cx.connection_id}
                className="flex items-center justify-between rounded-sm border border-[#222C38] bg-[#18202A] px-2 py-1 text-[11px]"
              >
                <span className="font-mono text-[#F1F5F9]">
                  {cx.connection_id}: {cx.from_flight}→{cx.to_flight} (
                  {cx.passengers}p)
                </span>
                <span
                  className={`font-mono font-semibold ${
                    cx.status === "INTACT"
                      ? "text-[#34D399]"
                      : "text-[#F87171]"
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
      <span className="flex items-center gap-1 rounded-sm border border-emerald-500/40 bg-emerald-950/50 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[#34D399]">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
        ON TIME
      </span>
    );
  }
  if (flight.status === "DELAYED") {
    return (
      <span className="flex items-center gap-1 rounded-sm border border-amber-500/40 bg-amber-950/50 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[#FBBF24]">
        <Clock className="h-3.5 w-3.5" aria-hidden="true" />
        +{flight.delayMin}m {flight.holdingStartMin !== null ? "HOLD" : "DELAY"}
      </span>
    );
  }
  if (flight.status === "CREW_BREACH") {
    return (
      <span className="flex items-center gap-1 rounded-sm border border-red-500/50 bg-red-950/60 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[#F87171]">
        <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
        CREW BREACH
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 rounded-sm border border-slate-600 bg-[#090D12] px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[#94A3B8]">
      <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
      CANCELLED
    </span>
  );
}
