"use client";

import { useState } from "react";
import { CloudLightning, Trash2, X } from "lucide-react";
import { formatHHMM, parseHHMM } from "@/lib/sim/engine";
import type { Airport, AirportClosure, SimulationResult } from "@/lib/sim/types";

interface AirportClosurePopoverProps {
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

export function AirportClosurePopover({
  airport,
  existingClosure,
  simulation,
  onSaveClosure,
  onRemoveClosure,
  onClose,
}: AirportClosurePopoverProps) {
  const [startStr, setStartStr] = useState(
    existingClosure ? formatHHMM(existingClosure.startMin) : "08:00"
  );
  const [endStr, setEndStr] = useState(
    existingClosure ? formatHHMM(existingClosure.endMin) : "09:30"
  );
  const [error, setError] = useState<string | null>(null);

  const touchingFlights = simulation.flights.filter(
    (f) => f.origin === airport.id || f.destination === airport.id
  );
  const disruptedTouching = touchingFlights.filter(
    (f) => f.status !== "ON_TIME"
  ).length;

  function applyDurationPreset(mins: number) {
    const startMin = parseHHMM(startStr);
    const clampedStart = Math.max(330, Math.min(1320, startMin));
    const endMin = Math.min(1380, clampedStart + mins);
    setEndStr(formatHHMM(endMin));
    setError(null);
  }

  function handleApply(e: React.FormEvent) {
    e.preventDefault();
    const startMin = parseHHMM(startStr);
    const endMin = parseHHMM(endStr);
    if (Number.isNaN(startMin) || Number.isNaN(endMin) || endMin <= startMin) {
      setError("Reopen time must be after closure start.");
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
      className="absolute right-3 top-3 z-20 w-72 rounded-lg border border-[#222C38] bg-[#11161D] p-3.5 shadow-xl"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-sm font-bold text-[#FBBF24]">
              {airport.id}
            </span>
            <span className="rounded-sm border border-[#222C38] bg-[#18202A] px-1.5 py-0.5 font-mono text-[10px] uppercase text-[#94A3B8]">
              {airport.tier.replace("_", " ")}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-[#94A3B8]">
            {airport.city} · Cap {airport.capacity_per_hour}/hr ·{" "}
            <span className="font-mono text-[#F1F5F9]">
              {touchingFlights.length}
            </span>{" "}
            flights ({disruptedTouching} impacted)
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close airport dialog"
          className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border border-[#222C38] bg-[#18202A] text-[#94A3B8] hover:text-[#F1F5F9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      <form onSubmit={handleApply} className="mt-3 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label
              htmlFor="closure-start"
              className="block text-[11px] font-medium text-[#94A3B8]"
            >
              Close From (IST)
            </label>
            <input
              id="closure-start"
              type="time"
              min="05:30"
              max="22:00"
              value={startStr}
              onChange={(e) => {
                setStartStr(e.target.value);
                setError(null);
              }}
              className="mt-1 h-8 w-full rounded-md border border-[#222C38] bg-[#090D12] px-2 font-mono text-xs text-[#F1F5F9] focus-visible:border-amber-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
            />
          </div>
          <div>
            <label
              htmlFor="closure-end"
              className="block text-[11px] font-medium text-[#94A3B8]"
            >
              Reopen At (IST)
            </label>
            <input
              id="closure-end"
              type="time"
              min="05:45"
              max="23:00"
              value={endStr}
              onChange={(e) => {
                setEndStr(e.target.value);
                setError(null);
              }}
              className="mt-1 h-8 w-full rounded-md border border-[#222C38] bg-[#090D12] px-2 font-mono text-xs text-[#F1F5F9] focus-visible:border-amber-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
            />
          </div>
        </div>

        <div>
          <span className="block text-[10px] font-medium uppercase tracking-wider text-[#94A3B8]">
            Quick Duration
          </span>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {DURATION_PRESETS.map((p) => (
              <button
                key={p.mins}
                type="button"
                onClick={() => applyDurationPreset(p.mins)}
                className="cursor-pointer rounded-sm border border-[#222C38] bg-[#18202A] px-2 py-1 font-mono text-[11px] text-[#F1F5F9] transition-colors duration-150 hover:border-amber-500/60 hover:bg-[#1F2937] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p className="text-xs font-medium text-[#F87171]" role="alert">
            {error}
          </p>
        )}

        <div className="flex items-center gap-2 pt-1">
          <button
            type="submit"
            className="flex h-8 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md bg-[#F59E0B] px-3 text-xs font-semibold text-[#090D12] transition-colors duration-150 hover:bg-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            <CloudLightning className="h-3.5 w-3.5" aria-hidden="true" />
            {existingClosure ? "Update Closure" : "Close Airport"}
          </button>

          {existingClosure && (
            <button
              type="button"
              onClick={() => {
                onRemoveClosure(airport.id);
                onClose();
              }}
              aria-label={`Reopen ${airport.id}`}
              className="flex h-8 cursor-pointer items-center justify-center rounded-md border border-red-500/40 bg-[#18202A] px-2.5 text-xs font-medium text-[#F87171] transition-colors duration-150 hover:bg-[#1F2937] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
