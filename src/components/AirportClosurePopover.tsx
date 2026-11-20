/**
 * Floating airport closure configurator popover supporting IST start/end times,
 * live duration slider, quick storm presets, and Escape-to-close keyboard handling.
 */

"use client";

import { useEffect, useState } from "react";
import { CloudLightning, Trash2, X } from "lucide-react";
import {
  CLOSURE_MAX,
  CLOSURE_MIN,
  formatHHMM,
  parseHHMM,
} from "@/lib/sim/constants";
import type { Airport, AirportClosure, SimulationResult } from "@/lib/sim/types";

/** Props accepted by `AirportClosurePopover`. */
export interface AirportClosurePopoverProps {
  airport: Airport;
  existingClosure?: AirportClosure;
  simulation: SimulationResult;
  onSaveClosure: (closure: AirportClosure) => void;
  onRemoveClosure: (airportId: string) => void;
  onClose: () => void;
}

const DURATION_PRESETS = [
  { label: "20m Buffer", mins: 20 },
  { label: "60m", mins: 60 },
  { label: "90m Storm", mins: 90 },
  { label: "110m Severe", mins: 110 },
  { label: "120m", mins: 120 },
];

/**
 * Renders the airport weather closure dialog anchored over the radar map.
 */
export function AirportClosurePopover({
  airport, existingClosure, simulation, onSaveClosure, onRemoveClosure, onClose,
}: AirportClosurePopoverProps) {
  const [startStr, setStartStr] = useState(existingClosure ? formatHHMM(existingClosure.startMin) : "08:00");
  const [endStr, setEndStr] = useState(existingClosure ? formatHHMM(existingClosure.endMin) : "09:30");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const touchingFlights = simulation.flights.filter(
    (f) => f.origin === airport.id || f.destination === airport.id
  );
  const disruptedTouching = touchingFlights.filter((f) => f.status !== "ON_TIME").length;

  const parsedStart = parseHHMM(startStr);
  const parsedEnd = parseHHMM(endStr);
  const sliderDurationMin =
    !Number.isNaN(parsedStart) && !Number.isNaN(parsedEnd) && parsedEnd > parsedStart
      ? Math.max(15, Math.min(240, parsedEnd - parsedStart))
      : 90;

  function applyDuration(mins: number) {
    const baseStart = Number.isNaN(parsedStart) ? 480 : parsedStart;
    const clampedStart = Math.max(CLOSURE_MIN, Math.min(CLOSURE_MAX - 15, baseStart));
    setStartStr(formatHHMM(clampedStart));
    setEndStr(formatHHMM(Math.min(CLOSURE_MAX, clampedStart + mins)));
    setError(null);
  }

  function handleApply(e: React.FormEvent) {
    e.preventDefault();
    const startMin = parseHHMM(startStr);
    const endMin = parseHHMM(endStr);
    if (
      Number.isNaN(startMin) || Number.isNaN(endMin) ||
      startMin < CLOSURE_MIN || endMin > CLOSURE_MAX || endMin <= startMin
    ) {
      setError("Closure must stay between 05:00 and 23:00 IST with reopen after start.");
      return;
    }
    onSaveClosure({
      id: existingClosure?.id ?? `closure-${airport.id}-${startMin}`,
      airportId: airport.id,
      startMin,
      endMin,
      label: `${airport.id} Closure`,
    });
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-label={`Configure closure for ${airport.id}`}
      className="absolute right-3 top-16 z-20 w-72 rounded-xl border border-[#E6EBF2] bg-[#FFFFFF] p-3.5 shadow-[0_8px_28px_rgba(148,163,184,0.18)]"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-sm font-bold text-[#1D4ED8]">{airport.id}</span>
            <span className="rounded-sm border border-[#E6EBF2] bg-[#F8FAFC] px-1.5 py-0.5 font-mono text-[10px] text-[#475569]">
              {airport.tier.replace("_", " ")}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-[#475569]">
            {airport.city} · Cap {airport.capacity_per_hour}/hr ·{" "}
            <span className="font-mono font-semibold text-[#0F172A]">{touchingFlights.length}</span>{" "}
            flights ({disruptedTouching} impacted)
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close airport dialog"
          className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB]"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      <form onSubmit={handleApply} className="mt-3 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="closure-start" className="block text-[11px] font-medium text-[#475569]">Close From (IST)</label>
            <input
              id="closure-start"
              type="time"
              min="05:00"
              max="22:45"
              value={startStr}
              onChange={(e) => { setStartStr(e.target.value); setError(null); }}
              className="mt-1 h-8 w-full rounded-md border border-[#CBD5E1] bg-[#FBFCFD] px-2 font-mono text-xs text-[#0F172A] focus-visible:border-[#2B79FB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB]"
            />
          </div>
          <div>
            <label htmlFor="closure-end" className="block text-[11px] font-medium text-[#475569]">Reopen At (IST)</label>
            <input
              id="closure-end"
              type="time"
              min="05:15"
              max="23:00"
              value={endStr}
              onChange={(e) => { setEndStr(e.target.value); setError(null); }}
              className="mt-1 h-8 w-full rounded-md border border-[#CBD5E1] bg-[#FBFCFD] px-2 font-mono text-xs text-[#0F172A] focus-visible:border-[#2B79FB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB]"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between text-[11px]">
            <label htmlFor="storm-duration-slider" className="font-medium text-[#475569]">Storm duration</label>
            <span className="font-mono font-semibold tabular-nums text-[#0F172A]">{sliderDurationMin}m</span>
          </div>
          <input
            id="storm-duration-slider"
            type="range"
            min={15}
            max={240}
            step={5}
            value={sliderDurationMin}
            aria-valuetext={`${sliderDurationMin} minutes`}
            onChange={(e) => applyDuration(Number(e.target.value))}
            className="mt-1.5 h-1.5 w-full cursor-pointer accent-[#2B79FB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB]"
          />
          <div className="mt-0.5 flex justify-between font-mono text-[9.5px] text-[#475569]">
            <span>15m</span>
            <span>120m</span>
            <span>240m</span>
          </div>
        </div>

        <div>
          <span className="block text-[11px] font-medium text-[#475569]">Quick duration</span>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {DURATION_PRESETS.map((p) => (
              <button
                key={p.mins}
                type="button"
                onClick={() => applyDuration(p.mins)}
                className={`cursor-pointer rounded-md border px-2 py-1 font-mono text-[11px] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB] ${
                  sliderDurationMin === p.mins
                    ? "border-[#1D4ED8] bg-[#EFF6FF] font-semibold text-[#1D4ED8]"
                    : "border-[#E6EBF2] bg-[#FBFCFD] text-[#0F172A] hover:border-[#2B79FB]/40 hover:bg-[#EFF6FF]"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-xs font-medium text-[#B91C1C]" role="alert">{error}</p>}

        <div className="flex items-center gap-2 pt-1">
          <button
            type="submit"
            className="flex h-8 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md bg-[#B91C1C] px-3 text-xs font-semibold text-white transition-colors duration-150 hover:bg-[#991B1B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB]"
          >
            <CloudLightning className="h-3.5 w-3.5" aria-hidden="true" />
            {existingClosure ? "Update Closure" : "Close Airport"}
          </button>
          {existingClosure && (
            <button
              type="button"
              onClick={() => { onRemoveClosure(airport.id); onClose(); }}
              aria-label={`Reopen ${airport.id}`}
              className="flex h-8 cursor-pointer items-center justify-center rounded-md border border-[#E6EBF2] bg-[#FBFCFD] px-2.5 text-xs font-medium text-[#475569] hover:bg-[#FEE2E2] hover:text-[#B91C1C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB]"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
