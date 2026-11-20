/**
 * Floating top-left flight telemetry overlay displaying a borderless 2x2 KPI
 * grid (`aria-live="polite"`) and a collapsible Airports & Disrupted Tails drawer.
 */

"use client";

import { memo, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, CloudLightning, Layers, Plane } from "lucide-react";
import { DATASET } from "@/lib/sim/constants";
import type { RecoveryCandidate, SimulationResult } from "@/lib/sim/types";

/** Props accepted by the floating `FlightStatsOverlay` panel. */
export interface FlightStatsOverlayProps {
  simulation: SimulationResult;
  previewCandidate: RecoveryCandidate | null;
  viewMode: "simple" | "advanced";
  showFragilityOverlay: boolean;
  selectedFlightId: string | null;
  selectedAirportId: string | null;
  onToggleFragilityOverlay: () => void;
  onSelectFlight: (flightId: string) => void;
  onSelectAirport: (airportId: string) => void;
}

function summarizeNetworkLists(simulation: SimulationResult) {
  const counts = new Map<string, { total: number; disrupted: number }>();
  for (const a of DATASET.airports) counts.set(a.id, { total: 0, disrupted: 0 });
  const tails = new Map<string, { firstFlightId: string; maxDelay: number; breached: boolean }>();

  for (const f of simulation.flights) {
    const entry = counts.get(f.origin);
    if (entry) {
      entry.total++;
      if (f.status !== "ON_TIME") entry.disrupted++;
    }
    if (f.status === "ON_TIME") continue;
    const cur = tails.get(f.tail_id);
    if (!cur) {
      tails.set(f.tail_id, { firstFlightId: f.flight_id, maxDelay: f.delayMin, breached: f.status === "CREW_BREACH" });
    } else {
      cur.maxDelay = Math.max(cur.maxDelay, f.delayMin);
      if (f.status === "CREW_BREACH") cur.breached = true;
    }
  }

  const maxTotal = Math.max(1, ...Array.from(counts.values()).map((v) => v.total));
  const airportRows = DATASET.airports
    .map((airport) => {
      const stat = counts.get(airport.id) ?? { total: 0, disrupted: 0 };
      return { airport, total: stat.total, disrupted: stat.disrupted, pct: Math.round((stat.total / maxTotal) * 100) };
    })
    .sort((a, b) => b.disrupted - a.disrupted || b.total - a.total);

  return { airportRows, disruptedTails: Array.from(tails.entries()) };
}

/**
 * Renders live operational flight statistics and quick-jump controls for
 * disrupted aircraft tails and the 16 Indian network airports.
 */
export const FlightStatsOverlay = memo(function FlightStatsOverlay({
  simulation, previewCandidate, viewMode, showFragilityOverlay,
  selectedFlightId, selectedAirportId, onToggleFragilityOverlay, onSelectFlight, onSelectAirport,
}: FlightStatsOverlayProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const { airportRows, disruptedTails } = useMemo(() => summarizeNetworkLists(simulation), [simulation]);
  const m = simulation.metrics;
  const pm = previewCandidate?.result.metrics;

  return (
    <div className="flex flex-col items-start gap-2.5">
      <div className="rounded-xl bg-[#FBFCFD]/90 py-1 pr-3" aria-live="polite">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#475569]">Flight Statistics</span>
          {simulation.closures.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#FEE2E2] px-2 py-0.5 font-mono text-[10px] font-semibold text-[#B91C1C]">
              <CloudLightning className="h-2.5 w-2.5" aria-hidden="true" />
              {simulation.closures.map((c) => c.airportId).join("+")} CLOSED
            </span>
          )}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-x-5 gap-y-2.5 font-mono tabular-nums">
          <StatCell label="delayed flights" value={m.delayedFlights} preview={pm?.delayedFlights} />
          <StatCell label="stranded pax" value={m.totalStrandedPax} preview={pm?.totalStrandedPax} alert={m.totalStrandedPax > 0} />
          <StatCell label="crew breaches" value={m.crewBreaches} preview={pm?.crewBreaches} alert={m.crewBreaches > 0} />
          <StatCell label="total delay" value={m.totalDelayMinutes} preview={pm?.totalDelayMinutes} suffix="m" />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          aria-expanded={isDrawerOpen}
          onClick={() => setIsDrawerOpen((v) => !v)}
          className="flex h-7 cursor-pointer items-center gap-1.5 rounded-full border border-[#E6EBF2] bg-[#FFFFFF] px-3 text-xs font-medium text-[#0F172A] shadow-[0_2px_10px_rgba(148,163,184,0.12)] transition-colors duration-150 hover:bg-[#F8FAFC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB]"
        >
          <span>Airports &amp; Disrupted Tails</span>
          {isDrawerOpen ? <ChevronUp className="h-3.5 w-3.5 text-[#475569]" aria-hidden="true" /> : <ChevronDown className="h-3.5 w-3.5 text-[#475569]" aria-hidden="true" />}
        </button>
        {viewMode === "advanced" && (
          <button
            type="button"
            aria-pressed={showFragilityOverlay}
            onClick={onToggleFragilityOverlay}
            className={`flex h-7 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-xs font-medium shadow-[0_2px_10px_rgba(148,163,184,0.12)] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB] ${
              showFragilityOverlay ? "border-[#1D4ED8] bg-[#EFF6FF] text-[#1D4ED8]" : "border-[#E6EBF2] bg-[#FFFFFF] text-[#475569] hover:text-[#0F172A]"
            }`}
          >
            <Layers className="h-3.5 w-3.5" aria-hidden="true" />
            Hub Fragility Rings
          </button>
        )}
      </div>

      {isDrawerOpen && (
        <div className="max-h-[52vh] w-72 overflow-y-auto rounded-xl border border-[#E6EBF2] bg-[#FFFFFF] p-3 shadow-[0_10px_28px_rgba(148,163,184,0.18)]">
          {disruptedTails.length > 0 && (
            <div className="mb-3 border-b border-[#E6EBF2] pb-2.5">
              <div className="text-[11px] font-semibold text-[#0F172A]">Disrupted aircraft ({disruptedTails.length})</div>
              <div className="mt-1.5 space-y-1">
                {disruptedTails.slice(0, 6).map(([tailId, info]) => {
                  const active = selectedFlightId !== null && simulation.flightsById[selectedFlightId]?.tail_id === tailId;
                  return (
                    <button
                      key={tailId}
                      type="button"
                      onClick={() => { onSelectFlight(info.firstFlightId); setIsDrawerOpen(false); }}
                      className={`flex w-full cursor-pointer items-center justify-between rounded-md px-2 py-1 text-xs transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB] ${active ? "bg-[#EFF6FF] font-semibold text-[#1D4ED8]" : "hover:bg-[#F8FAFC]"}`}
                    >
                      <span className="inline-flex items-center gap-1.5 font-mono"><Plane className="h-3 w-3 text-[#475569]" aria-hidden="true" />{tailId}</span>
                      <span className={`font-mono text-[11px] font-semibold ${info.breached ? "text-[#B91C1C]" : "text-[#B45309]"}`}>{info.breached ? "BREACH" : `+${info.maxDelay}m`}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-[#0F172A]">Airports (16)</span>
            <span className="text-[10px] text-[#475569]">Click to close</span>
          </div>
          <div className="mt-1.5 space-y-1">
            {airportRows.map(({ airport, total, disrupted, pct }) => {
              const isClosed = simulation.closures.some((c) => c.airportId === airport.id);
              return (
                <button
                  key={airport.id}
                  type="button"
                  onClick={() => { onSelectAirport(airport.id); setIsDrawerOpen(false); }}
                  className={`relative flex w-full cursor-pointer items-center justify-between overflow-hidden rounded-md px-2 py-1.5 text-left text-xs transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB] ${
                    isClosed ? "border border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]" : selectedAirportId === airport.id ? "bg-[#EFF6FF] text-[#1D4ED8]" : "hover:bg-[#F8FAFC]"
                  }`}
                >
                  <span className={`pointer-events-none absolute inset-y-0 left-0 ${isClosed ? "bg-[#FEE2E2]/60" : "bg-[#EFF6FF]"}`} style={{ width: `${pct}%`, opacity: isClosed ? 1 : 0.7 }} />
                  <span className="relative z-10 flex items-center gap-1.5"><span className="font-mono font-bold">{airport.id}</span><span className="truncate text-[#475569]">{airport.city}</span></span>
                  <span className="relative z-10 font-mono text-[11px] tabular-nums text-[#475569]">{disrupted > 0 ? <span className="font-semibold text-[#B45309]">{disrupted}/{total}</span> : total}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
});

function StatCell({ label, value, preview, alert = false, suffix = "" }: { label: string; value: number; preview?: number; alert?: boolean; suffix?: string }) {
  return (
    <div>
      <div className={`text-xl font-bold leading-none ${alert ? "text-[#B91C1C]" : "text-[#0F172A]"}`}>
        {value}{suffix}
        {preview !== undefined && preview !== value && <span className="ml-1 text-xs text-[#047857]">→{preview}{suffix}</span>}
      </div>
      <div className="mt-0.5 font-sans text-[11px] text-[#475569]">{label}</div>
    </div>
  );
}
