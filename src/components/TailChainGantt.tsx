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
import type { SimulatedFlight, SimulationResult } from "@/lib/sim/types";
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
      return (
        b.projectedEndMin - b.dutyLimitMin - (a.projectedEndMin - a.dutyLimitMin)
      );
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
      className={`flex w-full shrink-0 flex-col border-t border-[#E2E8F0] bg-[#FFFFFF] transition-[height] duration-200 ${
        expanded ? "h-56" : "h-10"
      }`}
    >
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-[#E2E8F0] px-3">
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
          <span className="hidden font-mono text-[10px] text-[#475569] md:inline">
            Red line = 600m crew cutoff · ABS = turnaround buffer absorbed
          </span>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="flex h-7 cursor-pointer items-center gap-1 rounded-md border border-[#E2E8F0] bg-[#F8FAFC] px-2 text-xs font-medium text-[#0F172A] hover:bg-[#F1F5F9]"
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

      {expanded && activeTab === "tails" && (
        <div className="flex-1 overflow-y-auto overflow-x-hidden bg-[#F8FAFC]">
          <div className="sticky top-0 z-10 flex h-6 border-b border-[#E2E8F0] bg-[#FFFFFF]">
            <div className="w-28 shrink-0 border-r border-[#E2E8F0] px-2 font-mono text-[10px] font-semibold leading-6 text-[#475569]">
              Tail / Crew
            </div>
            <div
              onClick={handleHeaderScrub}
              title="Click to scrub clock"
              className="relative flex-1 cursor-pointer"
            >
              {HOUR_TICKS.map((hr) => (
                <div
                  key={hr}
                  className="absolute top-0 bottom-0 border-l border-[#E2E8F0] pl-1 font-mono text-[10px] leading-6 text-[#475569]"
                  style={{ left: `${pct(hr * 60)}%` }}
                >
                  {String(hr).padStart(2, "0")}:00
                </div>
              ))}
              <div
                className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-[#2563EB]"
                style={{ left: `${pct(clockMin)}%` }}
              />
            </div>
          </div>

          <div className="divide-y divide-[#E2E8F0]">
            {tailRows.map(({ tailId, legs, crew, hasBreach, maxDelay }) => {
              const isSelectedTail = tailId === selectedTailId;
              return (
                <div
                  key={tailId}
                  className={`flex h-7 items-center ${
                    isSelectedTail ? "bg-[#EFF6FF]" : "bg-[#FFFFFF]"
                  }`}
                >
                  <div className="flex h-full w-28 shrink-0 items-center justify-between border-r border-[#E2E8F0] px-2 font-mono text-[11px]">
                    <span
                      className={`font-semibold ${
                        hasBreach
                          ? "text-[#DC2626]"
                          : maxDelay > 0
                            ? "text-[#B45309]"
                            : "text-[#0F172A]"
                      }`}
                    >
                      {tailId}
                    </span>
                    <span className="text-[9px] text-[#475569]">
                      {crew.crewId}
                    </span>
                  </div>

                  <div className="relative h-full flex-1">
                    {HOUR_TICKS.map((hr) => (
                      <div
                        key={`g-${hr}`}
                        className="pointer-events-none absolute top-0 bottom-0 border-l border-[#F1F5F9]"
                        style={{ left: `${pct(hr * 60)}%` }}
                      />
                    ))}

                    <div
                      title={`${crew.crewId} legal duty limit: ${formatHHMM(crew.dutyLimitMin)} IST`}
                      className="pointer-events-none absolute top-0 bottom-0 z-10 w-[1.5px] bg-[#DC2626]/70"
                      style={{ left: `${pct(crew.dutyLimitMin)}%` }}
                    />

                    <div
                      className="pointer-events-none absolute top-0 bottom-0 z-10 w-px bg-[#2563EB]/75"
                      style={{ left: `${pct(clockMin)}%` }}
                    />

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
                        "border-[#2563EB]/40 bg-[#EFF6FF] text-[#1D4ED8]";
                      if (leg.status === "DELAYED") {
                        barClass =
                          "gantt-delay-hatch border-[#D97706] bg-[#FEF3C7] text-[#B45309]";
                      } else if (leg.status === "CREW_BREACH") {
                        barClass =
                          "gantt-breach-stripe border-[#DC2626] text-[#DC2626]";
                      } else if (leg.status === "CANCELLED") {
                        barClass =
                          "border-dashed border-[#94A3B8] bg-[#F1F5F9] text-[#475569]";
                      }

                      return (
                        <div key={leg.flight_id}>
                          {leg.delayMin > 0 && leg.status !== "CANCELLED" && (
                            <div
                              className="pointer-events-none absolute top-1 bottom-1 rounded-sm border border-dashed border-[#94A3B8]"
                              style={{
                                left: `${schedLeft}%`,
                                width: `${schedWidth}%`,
                              }}
                            />
                          )}

                          <button
                            type="button"
                            onClick={() => onSelectFlight(leg.flight_id)}
                            title={`${leg.flight_id} (${leg.origin}->${leg.destination}) ${formatHHMM(leg.actualDepMin)}–${formatHHMM(leg.actualArrMin)}`}
                            className={`absolute top-[3px] bottom-[3px] flex cursor-pointer items-center justify-between overflow-hidden rounded-sm border px-1 font-mono text-[9.5px] font-semibold transition-colors duration-150 ${barClass} ${
                              isSel ? "ring-2 ring-[#2563EB]" : ""
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
                              <span className="ml-0.5 shrink-0 text-[8.5px] text-[#059669]">
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
        <div className="flex-1 overflow-y-auto bg-[#FFFFFF]">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="sticky top-0 bg-[#F8FAFC] font-mono text-[10px] text-[#475569]">
              <tr className="border-b border-[#E2E8F0]">
                <th className="px-3 py-1.5">ID</th>
                <th className="px-3 py-1.5">Hub</th>
                <th className="px-3 py-1.5">Transfer</th>
                <th className="px-3 py-1.5">Pax</th>
                <th className="px-3 py-1.5">Min MCT</th>
                <th className="px-3 py-1.5">Actual</th>
                <th className="px-3 py-1.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9]">
              {sortedConnections.map((cx) => (
                <tr
                  key={cx.connection_id}
                  onClick={() => onSelectFlight(cx.from_flight)}
                  className="cursor-pointer hover:bg-[#F8FAFC]"
                >
                  <td className="px-3 py-1.5 font-mono font-semibold text-[#0F172A]">
                    {cx.connection_id}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-[#475569]">
                    {cx.airport}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-[#0F172A]">
                    {cx.from_flight} → {cx.to_flight}
                  </td>
                  <td className="px-3 py-1.5 font-mono tabular-nums text-[#0F172A]">
                    {cx.passengers}
                  </td>
                  <td className="px-3 py-1.5 font-mono tabular-nums text-[#475569]">
                    {cx.min_connect_minutes}m
                  </td>
                  <td className="px-3 py-1.5 font-mono tabular-nums text-[#0F172A]">
                    {cx.actualConnectMin !== null
                      ? `${cx.actualConnectMin}m`
                      : "Grounded"}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-[11px] font-semibold">
                    {cx.status === "INTACT" ? (
                      <span className="text-[#059669]">INTACT</span>
                    ) : cx.status === "BROKEN_GROUNDED" ? (
                      <span className="text-[#DC2626]">GROUNDED</span>
                    ) : (
                      <span className="text-[#DC2626]">
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
        <div className="flex-1 overflow-y-auto bg-[#FFFFFF]">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="sticky top-0 bg-[#F8FAFC] font-mono text-[10px] text-[#475569]">
              <tr className="border-b border-[#E2E8F0]">
                <th className="px-3 py-1.5">Crew</th>
                <th className="px-3 py-1.5">Tail</th>
                <th className="px-3 py-1.5">Base</th>
                <th className="px-3 py-1.5">Start</th>
                <th className="px-3 py-1.5">Cutoff (600m)</th>
                <th className="px-3 py-1.5">Projected End</th>
                <th className="px-3 py-1.5">Legality</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9]">
              {sortedCrews.map((cr) => (
                <tr
                  key={cr.crewId}
                  onClick={() => {
                    if (cr.breachFlightId) onSelectFlight(cr.breachFlightId);
                  }}
                  className="cursor-pointer hover:bg-[#F8FAFC]"
                >
                  <td className="px-3 py-1.5 font-mono font-semibold text-[#0F172A]">
                    {cr.crewId}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-[#475569]">
                    {cr.tailId}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-[#475569]">
                    {cr.base}
                  </td>
                  <td className="px-3 py-1.5 font-mono tabular-nums text-[#0F172A]">
                    {formatHHMM(cr.dutyStartMin)}
                  </td>
                  <td className="px-3 py-1.5 font-mono tabular-nums text-[#0F172A]">
                    {formatHHMM(cr.dutyLimitMin)}
                  </td>
                  <td className="px-3 py-1.5 font-mono tabular-nums text-[#0F172A]">
                    {formatHHMM(cr.projectedEndMin)}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-[11px] font-semibold">
                    {cr.breached ? (
                      <span className="inline-flex items-center gap-1 text-[#DC2626]">
                        <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                        BREACH +{cr.overtimeMin}m ({cr.breachFlightId})
                      </span>
                    ) : (
                      <span className="text-[#059669]">LEGAL</span>
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
      className={`flex h-7 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors duration-150 ${
        active
          ? "border-[#2563EB] bg-[#EFF6FF] text-[#2563EB]"
          : alert
            ? "border-[#FECACA] bg-[#FEF2F2] text-[#DC2626]"
            : "border-transparent text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A]"
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
