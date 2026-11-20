/**
 * Interactive single-day IST timeline scrubber with hourly flight volume
 * histogram, storm window highlights, playback toggle, and speed selector.
 */

"use client";

import { useMemo } from "react";
import { FastForward, Pause, Play } from "lucide-react";
import { CLOCK_MAX, CLOCK_MIN, formatHHMM } from "@/lib/sim/constants";
import type { SimulationResult } from "@/lib/sim/types";

export { CLOCK_MAX, CLOCK_MIN };

/** Props accepted by `TimelineScrubber`. */
export interface TimelineScrubberProps {
  simulation: SimulationResult;
  clockMin: number;
  isPlaying: boolean;
  speed: number;
  onChangeClock: (min: number) => void;
  onTogglePlay: () => void;
  onCycleSpeed: () => void;
}

const BUCKET_COUNT = 34;

/**
 * Renders the floating bottom timeline scrubber and traffic density bars.
 */
export function TimelineScrubber({
  simulation,
  clockMin,
  isPlaying,
  speed,
  onChangeClock,
  onTogglePlay,
  onCycleSpeed,
}: TimelineScrubberProps) {
  const displayMin = Math.round(clockMin);

  const buckets = useMemo(() => {
    const step = (CLOCK_MAX - CLOCK_MIN) / BUCKET_COUNT;
    const arr = Array.from({ length: BUCKET_COUNT }, (_, idx) => {
      const start = CLOCK_MIN + idx * step;
      const end = start + step;
      let total = 0;
      let delayed = 0;
      let hasStorm = false;

      for (const c of simulation.closures) {
        if (c.startMin < end && c.endMin > start) hasStorm = true;
      }
      for (const f of simulation.flights) {
        if (f.status === "CANCELLED" || f.status === "CREW_BREACH") continue;
        if (f.actualDepMin < end && f.actualArrMin > start) {
          total++;
          if (f.delayMin > 0) delayed++;
        }
      }
      return { start, end, total, delayed, hasStorm };
    });
    const maxTotal = Math.max(1, ...arr.map((b) => b.total));
    return { arr, maxTotal };
  }, [simulation]);

  return (
    <div
      className="mx-3 mb-2.5 shrink-0 rounded-xl border border-[#E6EBF2] bg-[#FFFFFF] px-3.5 py-2 shadow-[0_4px_20px_rgba(148,163,184,0.12)]"
      role="region"
      aria-label="Flight timeline and hourly volume histogram"
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onTogglePlay}
          aria-label={isPlaying ? "Pause timeline" : "Play timeline"}
          aria-pressed={isPlaying}
          className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md bg-[#1D4ED8] text-white transition-colors duration-150 hover:bg-[#1E40AF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB]"
        >
          {isPlaying ? (
            <Pause className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Play className="h-4 w-4 translate-x-[1px]" aria-hidden="true" />
          )}
        </button>

        <button
          type="button"
          onClick={onCycleSpeed}
          title="Playback speed"
          aria-label={`Simulation speed ${speed}x. Click to cycle.`}
          className="flex h-8 shrink-0 cursor-pointer items-center gap-1 rounded-md border border-[#E6EBF2] bg-[#FBFCFD] px-2 font-mono text-xs font-semibold text-[#0F172A] transition-colors duration-150 hover:bg-[#F1F5F9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB]"
        >
          <FastForward className="h-3 w-3 text-[#1D4ED8]" aria-hidden="true" />
          <span>{speed}x</span>
        </button>

        <div className="flex flex-1 flex-col gap-1">
          <div className="flex h-6 items-end gap-[2px]" aria-hidden="true">
            {buckets.arr.map((b, i) => {
              const hPct = Math.max(14, Math.round((b.total / buckets.maxTotal) * 100));
              const isCurrent = displayMin >= b.start && displayMin < b.end;
              const color = isCurrent
                ? "bg-[#2B79FB]"
                : b.hasStorm
                  ? "bg-[#FCA5A5]"
                  : b.delayed > 0
                    ? "bg-[#FDE68A]"
                    : "bg-[#DEE4EF]";
              return (
                <div
                  key={i}
                  onClick={() => onChangeClock(Math.round(b.start + 10))}
                  className={`flex-1 cursor-pointer rounded-t-[2px] transition-colors duration-100 ${color}`}
                  style={{ height: `${hPct}%` }}
                />
              );
            })}
          </div>

          <label htmlFor="occ-clock-slider" className="sr-only">
            Simulation time in IST
          </label>
          <input
            id="occ-clock-slider"
            type="range"
            min={CLOCK_MIN}
            max={CLOCK_MAX}
            step={1}
            value={displayMin}
            aria-valuetext={`${formatHHMM(displayMin)} IST`}
            onChange={(e) => onChangeClock(Number(e.target.value))}
            className="h-1.5 w-full cursor-pointer accent-[#2B79FB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB]"
          />
        </div>

        <div className="w-24 shrink-0 text-right font-mono tabular-nums">
          <div className="flex items-center justify-end gap-1.5">
            {isPlaying && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#ECFDF5] px-1.5 py-0.5 font-mono text-[9px] font-semibold text-[#047857]">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#047857]" aria-hidden="true" />
                LIVE
              </span>
            )}
            <span className="text-sm font-bold text-[#0F172A]">{formatHHMM(displayMin)}</span>
          </div>
          <div className="text-[10px] text-[#475569]">IST · 05:30–22:30</div>
        </div>
      </div>
    </div>
  );
}
