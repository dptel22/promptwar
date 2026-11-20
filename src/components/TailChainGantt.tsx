"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Clock,
  Link2,
  ShieldAlert,
  Users,
} from "lucide-react";
import { formatHHMM } from "@/lib/sim/engine";
import type {
  SimulatedFlight,
  SimulationResult,
} from "@/lib/sim/types";
import { CLOCK_MAX, CLOCK_MIN } from "./TimelineScrubber";

interface TailChainGanttProps {
  simulation: SimulationResult;
  clockMin: number;
  selectedFlightId: string | null;
  onSelectFlight: (flightId: string) => void;
  onChangeClock: (clockMin: number) => void;
}

const HOUR_TICKS = [6, 8, 10, 12, 14, 16, 18, 20, 22];

function pct(min: number): number {
  return Math.max(
    0,
    Math.min(100, ((min - CLOCK_MIN) / (CLOCK_MAX - CLOCK_MIN)) * 100)
  );
}

export function TailChainGantt({
  simulation,
  clockMin,
  selectedFlightId,
  onSelectFlight,
  onChangeClock,
}: TailChainGanttProps) {
  const [expanded, setExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<"tails" | "connections" | "crews">(
    "tails"
  );

  const selectedTailId = selectedFlightId
    ? simulation.flightsById[selectedFlightId]?.tail_id ?? null
    : null;

  const tailRows = useMemo(() => {
    const map = new Map<string, SimulatedFlight[]>();
    for (const f of simulation.flights) {
      const list = map.get(f.tail_id);
      if (list) list.push(f);
      else map.set(f.tail_id, [f]);
    }
    const crewByTail = new Map(simulation.crews.map((c) => [c.tailId, c]));

    return Array.from(map.entries())
      .map(([tailId, legs]) => {
        const sorted = [...legs].sort((a, b) => a.leg_order - b.leg_order);
        const crew = crewByTail.get(tailId)!;
        const hasBreach = sorted.some((l) => l.status === "CREW_BREACH");
        const hasCancel = sorted.some((l) => l.status === "CANCELLED");
        const maxDelay = Math.max(...sorted.map((l) => l.delayMin));
        const hasAbsorb = sorted.some((l) => l.bufferAbsorbedMin > 0);
        const priority = hasBreach
          ? 0
          : maxDelay > 0
            ? 1
            : hasCancel
              ? 2
              : hasAbsorb
                ? 3
                : 4;
        return { tailId, legs: sorted, crew, priority, maxDelay, hasBreach };
      })
      .sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        if (b.maxDelay !== a.maxDelay) return b.maxDelay - a.maxDelay;
        return a.tailId.localeCompare(b.tailId);
      });
  }, [simulation]);

  const sortedConnections = useMemo(() => {
    return [...simulation.connections].sort((a, b) => {
      const rank = (s: string) =>
        s === "BROKEN_GROUNDED" ? 0 : s === "BROKEN_TIME" ? 1 : 2;
      if (rank(a.status) !== rank(b.status)) {
        return rank(a.status) - rank(b.status);
      }
      return b.passengers - a.passengers;
    });
  }, [simulation.connections]);

  const sortedCrews = useMemo(() => {
    return [...simulation.crews].sort((a, b) => {
      if (a.breached !== b.breached) return a.breached ? -1 : 1;
      return b.projectedEndMin - b.dutyLimitMin - (a.projectedEndMin - a.dutyLimitMin);
    });
  }, [simulation.crews]);

  function handleHeaderScrub(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onChangeClock(Math.round(CLOCK_MIN + ratio * (CLOCK_MAX - CLOCK_MIN)));
  }

  return (
    <section
      aria-label="Tail chains, passenger connections, and crew duty timelines"
      className={`flex w-full shrink-0 flex-col border-t border-[#222C38] bg-[#11161D] transition-[height] duration-200 ${
        expanded ? "h-60" : "h-10"
      }`}
    >
      {/* Panel Header */}
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-[#222C38] px-3">
        <div className="flex items-center gap-1.5" role="tablist">
          <TabButton
            active={activeTab === "tails"}
            onClick={() => {
              setActiveTab("tails");
              setExpanded(true);
            }}
            icon={<Clock className="h-3.5 w-3.5" aria-hidden="true" />}
            label="Tail Chains (16)"
          />
          <TabButton
            active={activeTab === "connections"}
            onClick={() => {
              setActiveTab("connections");
              setExpanded(true);
            }}
            icon={<Link2 className="h-3.5 w-3.5" aria-hidden="true" />}
            label={`Connections (${simulation.metrics.brokenConnections} broken)`}
            alert={simulation.metrics.brokenConnections > 0}
          />
          <TabButton
            active={activeTab === "crews"}
            onClick={() => {
              setActiveTab("crews");
              setExpanded(true);
            }}
            icon={<Users className="h-3.5 w-3.5" aria-hidden="true" />}
            label={`Crews (${simulation.metrics.crewBreaches} breach)`}
            alert={simulation.metrics.crewBreaches > 0}
          />
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden font-mono text-[10px] text-[#94A3B8] md:inline">
            Red vertical marker = 600m crew duty limit · Green tick = turnaround
            slack absorbed
          </span>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="flex h-7 cursor-pointer items-center gap-1 rounded-md border border-[#222C38] bg-[#18202A] px-2 text-xs font-medium text-[#F1F5F9] transition-colors duration-150 hover:bg-[#1F2937] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            <span>{expanded ? "Collapse" : "Expand Gantt"}</span>
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {/* Scrollable Body */}
      {expanded && activeTab === "tails" && (
        <div className="flex-1 overflow-y-auto overflow-x-hidden bg-[#090D12]">
          {/* Sticky Time Axis */}
          <div className="sticky top-0 z-10 flex h-6 border-b border-[#222C38] bg-[#11161D]">
            <div className="w-28 shrink-0 border-r border-[#222C38] px-2 font-mono text-[10px] font-semibold leading-6 text-[#94A3B8]">
              TAIL / CREW
            </div>
            <div
              onClick={handleHeaderScrub}
              title="Click anywhere along timeline to scrub IST clock"
              className="relative flex-1 cursor-pointer"
            >
              {HOUR_TICKS.map((hr) => (
                <div
                  key={hr}
                  className="absolute top-0 bottom-0 border-l border-[#222C38] pl-1 font-mono text-[10px] leading-6 text-[#94A3B8]"
                  style={{ left: `${pct(hr * 60)}%` }}
                >
                  {String(hr).padStart(2, "0")}:00
                </div>
              ))}
              <div
                className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-[#F59E0B]"
                style={{ left: `${pct(clockMin)}%` }}
              />
            </div>
          </div>

          {/* 16 Tail Rows (28px fixed height each) */}
          <div className="divide-y divide-[#18202A]">
            {tailRows.map(({ tailId, legs, crew, hasBreach, maxDelay }) => {
              const isSelectedTail = tailId === selectedTailId;
              return (
                <div
                  key={tailId}
                  className={`flex h-7 items-center ${
                    isSelectedTail ? "bg-[#18202A]" : "bg-[#090D12]"
                  }`}
                >
                  <div className="flex h-full w-28 shrink-0 items-center justify-between border-r border-[#222C38] px-2 font-mono text-[11px]">
                    <span
                      className={`font-semibold ${
                        hasBreach
                          ? "text-[#F87171]"
                          : maxDelay > 0
                            ? "text-[#FBBF24]"
                            : "text-[#F1F5F9]"
                      }`}
                    >
                      {tailId}
                    </span>
                    <span className="text-[9px] text-[#94A3B8]">
                      {crew.crewId}
                    </span>
                  </div>

                  <div className="relative h-full flex-1">
                    {/* Hour guide lines */}
                    {HOUR_TICKS.map((hr) => (
                      <div
                        key={`g-${hr}`}
                        className="pointer-events-none absolute top-0 bottom-0 border-l border-[#141B24]"
                        style={{ left: `${pct(hr * 60)}%` }}
                      />
                    ))}

                    {/* Crew Duty Limit Wall */}
                    <div
                      title={`${crew.crewId} legal duty limit: ${formatHHMM(crew.dutyLimitMin)} IST`}
                      className="pointer-events-none absolute top-0 bottom-0 z-10 w-[1.5px] bg-[#EF4444]/75"
                      style={{ left: `${pct(crew.dutyLimitMin)}%` }}
                    />

                    {/* Synchronized Playhead */}
                    <div
                      className="pointer-events-none absolute top-0 bottom-0 z-10 w-px bg-[#F59E0B]/70"
                      style={{ left: `${pct(clockMin)}%` }}
                    />

                    {/* Flight Bars */}
                    {legs.map((leg) => {
                      const schedLeft = pct(leg.scheduledDepMin);
                      const schedWidth = Math.max(
                        1,
                        pct(leg.scheduledArrMin) - schedLeft
                      );
                      const actLeft = pct(leg.actualDepMin);
                      const actWidth = Math.max(
                        1.4,
                        pct(leg.actualArrMin) - actLeft
                      );
                      const isSel = leg.flight_id === selectedFlightId;

                      let barClass =
                        "border-emerald-500/60 bg-emerald-950/70 text-[#34D399]";
                      if (leg.status === "DELAYED") {
                        barClass =
                          "gantt-delay-hatch border-amber-500/70 bg-amber-950/60 text-[#FBBF24]";
                      } else if (leg.status === "CREW_BREACH") {
                        barClass =
                          "gantt-breach-stripe border-red-500 text-[#F87171]";
                      } else if (leg.status === "CANCELLED") {
                        barClass =
                          "border-dashed border-slate-600 bg-[#11161D] text-[#94A3B8]";
                      }

                      return (
                        <div key={leg.flight_id}>
                          {/* Original scheduled ghost outline when shifted */}
                          {leg.delayMin > 0 && leg.status !== "CANCELLED" && (
                            <div
                              className="pointer-events-none absolute top-1 bottom-1 rounded-sm border border-dashed border-[#475569]/50"
                              style={{
                                left: `${schedLeft}%`,
                                width: `${schedWidth}%`,
                              }}
                            />
                          )}

                          <button
                            type="button"
                            onClick={() => onSelectFlight(leg.flight_id)}
                            title={`${leg.flight_id} (${leg.origin}->${leg.destination}) ${formatHHMM(leg.actualDepMin)}–${formatHHMM(leg.actualArrMin)}${leg.delayMin > 0 ? ` +${leg.delayMin}m` : ""}${leg.bufferAbsorbedMin > 0 ? ` [Absorbed ${leg.bufferAbsorbedMin}m]` : ""}`}
                            className={`absolute top-[3px] bottom-[3px] flex cursor-pointer items-center justify-between overflow-hidden rounded-sm border px-1 font-mono text-[9.5px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${barClass} ${
                              isSel ? "ring-1 ring-[#F1F5F9]" : ""
                            }`}
                            style={{
                              left: `${actLeft}%`,
                              width: `${actWidth}%`,
                            }}
                          >
                            <span className="truncate">
                              {leg.origin}→{leg.destination}
                            </span>
                            {leg.status === "CREW_BREACH" ? (
                              <ShieldAlert
                                className="h-2.5 w-2.5 shrink-0"
                                aria-hidden="true"
                              />
                            ) : leg.bufferAbsorbedMin > 0 && leg.delayMin === 0 ? (
                              <span className="ml-0.5 shrink-0 text-[8.5px] text-[#34D399]">
                                ABS
                              </span>
                            ) : leg.delayMin > 0 ? (
                              <span className="ml-0.5 shrink-0 text-[8.5px]">
                                +{leg.delayMin}
                              </span>
                            ) : null}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {expanded && activeTab === "connections" && (
        <div className="flex-1 overflow-y-auto bg-[#090D12]">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="sticky top-0 bg-[#11161D] font-mono text-[10px] uppercase text-[#94A3B8]">
              <tr className="border-b border-[#222C38]">
                <th className="px-3 py-1.5">ID</th>
                <th className="px-3 py-1.5">Hub</th>
                <th className="px-3 py-1.5">Transfer</th>
                <th className="px-3 py-1.5">Pax</th>
                <th className="px-3 py-1.5">Min MCT</th>
                <th className="px-3 py-1.5">Actual Window</th>
                <th className="px-3 py-1.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#18202A]">
              {sortedConnections.map((cx) => (
                <tr
                  key={cx.connection_id}
                  onClick={() => onSelectFlight(cx.from_flight)}
                  className="cursor-pointer hover:bg-[#18202A]"
                >
                  <td className="px-3 py-1.5 font-mono font-semibold text-[#F1F5F9]">
                    {cx.connection_id}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-[#94A3B8]">
                    {cx.airport}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-[#F1F5F9]">
                    {cx.from_flight} → {cx.to_flight}
                  </td>
                  <td className="px-3 py-1.5 font-mono tabular-nums text-[#F1F5F9]">
                    {cx.passengers}
                  </td>
                  <td className="px-3 py-1.5 font-mono tabular-nums text-[#94A3B8]">
                    {cx.min_connect_minutes}m
                  </td>
                  <td className="px-3 py-1.5 font-mono tabular-nums text-[#F1F5F9]">
                    {cx.actualConnectMin !== null
                      ? `${cx.actualConnectMin}m`
                      : "Grounded"}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-[11px] font-semibold">
                    {cx.status === "INTACT" ? (
                      <span className="text-[#34D399]">INTACT</span>
                    ) : cx.status === "BROKEN_GROUNDED" ? (
                      <span className="text-[#F87171]">GROUNDED</span>
                    ) : (
                      <span className="text-[#F87171]">
                        MISSED (-{cx.shortfallMin}m)
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {expanded && activeTab === "crews" && (
        <div className="flex-1 overflow-y-auto bg-[#090D12]">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="sticky top-0 bg-[#11161D] font-mono text-[10px] uppercase text-[#94A3B8]">
              <tr className="border-b border-[#222C38]">
                <th className="px-3 py-1.5">Crew</th>
                <th className="px-3 py-1.5">Tail</th>
                <th className="px-3 py-1.5">Base</th>
                <th className="px-3 py-1.5">Duty Start</th>
                <th className="px-3 py-1.5">Legal Cutoff (600m)</th>
                <th className="px-3 py-1.5">Projected End</th>
                <th className="px-3 py-1.5">Legality</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#18202A]">
              {sortedCrews.map((cr) => (
                <tr
                  key={cr.crewId}
                  onClick={() => {
                    if (cr.breachFlightId) onSelectFlight(cr.breachFlightId);
                  }}
                  className="cursor-pointer hover:bg-[#18202A]"
                >
                  <td className="px-3 py-1.5 font-mono font-semibold text-[#F1F5F9]">
                    {cr.crewId}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-[#94A3B8]">
                    {cr.tailId}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-[#94A3B8]">
                    {cr.base}
                  </td>
                  <td className="px-3 py-1.5 font-mono tabular-nums text-[#F1F5F9]">
                    {formatHHMM(cr.dutyStartMin)}
                  </td>
                  <td className="px-3 py-1.5 font-mono tabular-nums text-[#F1F5F9]">
                    {formatHHMM(cr.dutyLimitMin)}
                  </td>
                  <td className="px-3 py-1.5 font-mono tabular-nums text-[#F1F5F9]">
                    {formatHHMM(cr.projectedEndMin)}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-[11px] font-semibold">
                    {cr.breached ? (
                      <span className="inline-flex items-center gap-1 text-[#F87171]">
                        <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                        BREACH +{cr.overtimeMin}m ({cr.breachFlightId})
                      </span>
                    ) : (
                      <span className="text-[#34D399]">LEGAL</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  alert,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  alert?: boolean;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex h-7 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
        active
          ? "border-amber-500/60 bg-[#18202A] text-[#F1F5F9]"
          : alert
            ? "border-[#222C38] bg-[#11161D] text-[#F87171] hover:bg-[#18202A]"
            : "border-transparent bg-transparent text-[#94A3B8] hover:bg-[#18202A] hover:text-[#F1F5F9]"
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
