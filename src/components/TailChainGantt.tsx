/**
 * Collapsible advanced inspection dock displaying 16-tail rotation Gantt bars,
 * crew legal duty cutoffs, passenger connections, and crew duty tables.
 */

"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Clock, Link2, ShieldAlert, Users } from "lucide-react";
import { CLOCK_MAX, CLOCK_MIN, formatHHMM } from "@/lib/sim/constants";
import type { SimulatedCrew, SimulatedFlight, SimulationResult } from "@/lib/sim/types";
import { ConnectionsTable, CrewsTable } from "./gantt/GanttTables";

/** Props accepted by `TailChainGantt`. */
export interface TailChainGanttProps {
  simulation: SimulationResult;
  clockMin: number;
  selectedFlightId: string | null;
  onSelectFlight: (flightId: string) => void;
  onChangeClock: (clockMin: number) => void;
}

const HOUR_TICKS = [6, 8, 10, 12, 14, 16, 18, 20, 22];

function pct(min: number): number {
  return Math.max(0, Math.min(100, ((min - CLOCK_MIN) / (CLOCK_MAX - CLOCK_MIN)) * 100));
}

interface TailRowData {
  tailId: string;
  legs: SimulatedFlight[];
  crew: SimulatedCrew | undefined;
  priority: number;
  maxDelay: number;
  hasBreach: boolean;
}

function buildTailRows(simulation: SimulationResult): TailRowData[] {
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
      const crew = crewByTail.get(tailId);
      const hasBreach = sorted.some((l) => l.status === "CREW_BREACH");
      const hasCancel = sorted.some((l) => l.status === "CANCELLED");
      const maxDelay = Math.max(0, ...sorted.map((l) => l.delayMin));
      const hasAbsorb = sorted.some((l) => l.bufferAbsorbedMin > 0);
      const priority = hasBreach ? 0 : maxDelay > 0 ? 1 : hasCancel ? 2 : hasAbsorb ? 3 : 4;
      return { tailId, legs: sorted, crew, priority, maxDelay, hasBreach };
    })
    .sort((a, b) => a.priority - b.priority || b.maxDelay - a.maxDelay || a.tailId.localeCompare(b.tailId));
}

/**
 * Renders the tabbed tail-chain Gantt, connection tracker, and crew legality view.
 */
export function TailChainGantt({
  simulation, clockMin, selectedFlightId, onSelectFlight, onChangeClock,
}: TailChainGanttProps) {
  const [expanded, setExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<"tails" | "connections" | "crews">("tails");
  const selectedTailId = selectedFlightId ? simulation.flightsById[selectedFlightId]?.tail_id ?? null : null;
  const tailRows = useMemo(() => buildTailRows(simulation), [simulation]);

  function handleHeaderScrub(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onChangeClock(Math.round(CLOCK_MIN + ratio * (CLOCK_MAX - CLOCK_MIN)));
  }

  return (
    <section
      aria-label="Tail chains, passenger connections, and crew duty timelines"
      className={`flex w-full shrink-0 flex-col border-t border-[#E6EBF2] bg-[#FFFFFF] transition-[height] duration-200 ${
        expanded ? "h-56" : "h-10"
      }`}
    >
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-[#E6EBF2] px-3">
        <div className="flex items-center gap-1.5" role="tablist">
          <TabButton active={activeTab === "tails"} onClick={() => { setActiveTab("tails"); setExpanded(true); }} icon={<Clock className="h-3.5 w-3.5" aria-hidden="true" />} label="Tail Chains (16)" />
          <TabButton active={activeTab === "connections"} onClick={() => { setActiveTab("connections"); setExpanded(true); }} icon={<Link2 className="h-3.5 w-3.5" aria-hidden="true" />} label={`Connections (${simulation.metrics.brokenConnections} broken)`} alert={simulation.metrics.brokenConnections > 0} />
          <TabButton active={activeTab === "crews"} onClick={() => { setActiveTab("crews"); setExpanded(true); }} icon={<Users className="h-3.5 w-3.5" aria-hidden="true" />} label={`Crews (${simulation.metrics.crewBreaches} breach)`} alert={simulation.metrics.crewBreaches > 0} />
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden font-mono text-[10px] text-[#475569] md:inline">
            Red line = 600m crew cutoff · ABS = turnaround buffer absorbed
          </span>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="flex h-7 cursor-pointer items-center gap-1 rounded-md border border-[#E6EBF2] bg-[#FBFCFD] px-2 text-xs font-medium text-[#0F172A] hover:bg-[#F1F5F9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB]"
          >
            <span>{expanded ? "Collapse" : "Expand Gantt"}</span>
            {expanded ? <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />}
          </button>
        </div>
      </div>

      {expanded && activeTab === "tails" && (
        <div className="flex-1 overflow-y-auto overflow-x-hidden bg-[#FBFCFD]">
          <div className="sticky top-0 z-10 flex h-6 border-b border-[#E6EBF2] bg-[#FFFFFF]">
            <div className="w-28 shrink-0 border-r border-[#E6EBF2] px-2 font-mono text-[10px] font-semibold leading-6 text-[#475569]">
              Tail / Crew
            </div>
            <div onClick={handleHeaderScrub} title="Click to scrub clock" className="relative flex-1 cursor-pointer">
              {HOUR_TICKS.map((hr) => (
                <div key={hr} className="absolute top-0 bottom-0 border-l border-[#E6EBF2] pl-1 font-mono text-[10px] leading-6 text-[#475569]" style={{ left: `${pct(hr * 60)}%` }}>
                  {String(hr).padStart(2, "0")}:00
                </div>
              ))}
              <div className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-[#2B79FB]" style={{ left: `${pct(clockMin)}%` }} />
            </div>
          </div>

          <div className="divide-y divide-[#E6EBF2]">
            {tailRows.map((row) => (
              <TailRow key={row.tailId} row={row} clockMin={clockMin} isSelectedTail={row.tailId === selectedTailId} selectedFlightId={selectedFlightId} onSelectFlight={onSelectFlight} />
            ))}
          </div>
        </div>
      )}

      {expanded && activeTab === "connections" && (
        <ConnectionsTable connections={simulation.connections} onSelectFlight={onSelectFlight} />
      )}
      {expanded && activeTab === "crews" && (
        <CrewsTable crews={simulation.crews} onSelectFlight={onSelectFlight} />
      )}
    </section>
  );
}

function TailRow({
  row, clockMin, isSelectedTail, selectedFlightId, onSelectFlight,
}: {
  row: TailRowData;
  clockMin: number;
  isSelectedTail: boolean;
  selectedFlightId: string | null;
  onSelectFlight: (flightId: string) => void;
}) {
  const { tailId, legs, crew, hasBreach, maxDelay } = row;
  return (
    <div className={`flex h-7 items-center ${isSelectedTail ? "bg-[#EFF6FF]" : "bg-[#FFFFFF]"}`}>
      <div className="flex h-full w-28 shrink-0 items-center justify-between border-r border-[#E6EBF2] px-2 font-mono text-[11px]">
        <span className={`font-semibold ${hasBreach ? "text-[#B91C1C]" : maxDelay > 0 ? "text-[#B45309]" : "text-[#0F172A]"}`}>{tailId}</span>
        <span className="text-[9px] text-[#475569]">{crew?.crewId ?? "—"}</span>
      </div>
      <div className="relative h-full flex-1">
        {HOUR_TICKS.map((hr) => (
          <div key={hr} className="pointer-events-none absolute top-0 bottom-0 border-l border-[#F1F5F9]" style={{ left: `${pct(hr * 60)}%` }} />
        ))}
        {crew && (
          <div title={`${crew.crewId} legal duty limit: ${formatHHMM(crew.dutyLimitMin)} IST`} className="pointer-events-none absolute top-0 bottom-0 z-10 w-[1.5px] bg-[#B91C1C]/75" style={{ left: `${pct(crew.dutyLimitMin)}%` }} />
        )}
        <div className="pointer-events-none absolute top-0 bottom-0 z-10 w-px bg-[#2B79FB]/75" style={{ left: `${pct(clockMin)}%` }} />
        {legs.map((leg) => {
          const schedLeft = pct(leg.scheduledDepMin);
          const schedWidth = Math.max(1, pct(leg.scheduledArrMin) - schedLeft);
          const actLeft = pct(leg.actualDepMin);
          const actWidth = Math.max(1.4, pct(leg.actualArrMin) - actLeft);
          const barClass = leg.status === "DELAYED"
            ? "gantt-delay-hatch border-[#D97706] bg-[#FEF3C7] text-[#B45309]"
            : leg.status === "CREW_BREACH"
              ? "gantt-breach-stripe border-[#B91C1C] text-[#B91C1C]"
              : leg.status === "CANCELLED"
                ? "border-dashed border-[#94A3B8] bg-[#F1F5F9] text-[#475569]"
                : "border-[#2B79FB]/40 bg-[#EFF6FF] text-[#1D4ED8]";
          return (
            <div key={leg.flight_id}>
              {leg.delayMin > 0 && leg.status !== "CANCELLED" && (
                <div className="pointer-events-none absolute top-1 bottom-1 rounded-sm border border-dashed border-[#94A3B8]" style={{ left: `${schedLeft}%`, width: `${schedWidth}%` }} />
              )}
              <button
                type="button"
                onClick={() => onSelectFlight(leg.flight_id)}
                title={`${leg.flight_id} (${leg.origin}->${leg.destination}) ${formatHHMM(leg.actualDepMin)}–${formatHHMM(leg.actualArrMin)}`}
                className={`absolute top-[3px] bottom-[3px] flex cursor-pointer items-center justify-between overflow-hidden rounded-sm border px-1 font-mono text-[9.5px] font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB] ${barClass} ${leg.flight_id === selectedFlightId ? "ring-2 ring-[#2B79FB]" : ""}`}
                style={{ left: `${actLeft}%`, width: `${actWidth}%` }}
              >
                <span className="truncate">{leg.origin}→{leg.destination}</span>
                {leg.status === "CREW_BREACH" ? (
                  <ShieldAlert className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                ) : leg.bufferAbsorbedMin > 0 && leg.delayMin === 0 ? (
                  <span className="ml-0.5 shrink-0 text-[8.5px] text-[#047857]">ABS</span>
                ) : leg.delayMin > 0 ? (
                  <span className="ml-0.5 shrink-0 text-[8.5px]">+{leg.delayMin}</span>
                ) : null}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon, label, alert }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; alert?: boolean }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex h-7 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB] ${
        active ? "border-[#1D4ED8] bg-[#EFF6FF] text-[#1D4ED8]" : alert ? "border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]" : "border-transparent text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A]"
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
