"use client";

import { useMemo } from "react";
import { FastForward, Pause, Play } from "lucide-react";
import { formatHHMM } from "@/lib/sim/engine";
import type { SimulationResult } from "@/lib/sim/types";

export const CLOCK_MIN = 330; // 05:30 IST
export const CLOCK_MAX = 1350; // 22:30 IST

interface TimelineScrubberProps {
  simulation: SimulationResult;
  clockMin: number;
  isPlaying: boolean;
  speed: number;
  onChangeClock: (min: number) => void;
  onTogglePlay: () => void;
  onCycleSpeed: () => void;
}

const BUCKET_COUNT = 34;

export function TimelineScrubber({
  simulation,
  clockMin,
  isPlaying,
  speed,
  onChangeClock,
  onTogglePlay,
  onCycleSpeed,
}: TimelineScrubberProps) {
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
      className="shrink-0 border-t border-[#E2E8F0] bg-[#FFFFFF] px-4 py-2.5"
      role="region"
      aria-label="Flight timeline and hourly volume histogram"
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onTogglePlay}
          aria-label={isPlaying ? "Pause timeline" : "Play timeline"}
          className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md bg-[#2563EB] text-white transition-colors duration-150 hover:bg-[#1D4ED8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
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
          className="flex h-8 shrink-0 cursor-pointer items-center gap-1 rounded-md border border-[#E2E8F0] bg-[#F8FAFC] px-2 font-mono text-xs font-semibold text-[#0F172A] hover:bg-[#F1F5F9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
        >
          <FastForward className="h-3 w-3 text-[#2563EB]" aria-hidden="true" />
          <span>{speed}x</span>
        </button>

        <div className="flex flex-1 flex-col gap-1">
          <div className="flex h-7 items-end gap-[2px]" aria-hidden="true">
            {buckets.arr.map((b, i) => {
              const hPct = Math.max(
                12,
                Math.round((b.total / buckets.maxTotal) * 100)
              );
              const isPast = clockMin >= b.start && clockMin < b.end;
              const color = isPast
                ? "bg-[#2563EB]"
                : b.hasStorm
                  ? "bg-[#FCA5A5]"
                  : b.delayed > 0
                    ? "bg-[#FCD34D]"
                    : "bg-[#CBD5E1]";
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
            value={clockMin}
            aria-valuetext={`${formatHHMM(clockMin)} IST`}
            onChange={(e) => onChangeClock(Number(e.target.value))}
            className="h-2 w-full cursor-pointer accent-[#2563EB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
          />
        </div>

        <div className="w-20 shrink-0 text-right font-mono tabular-nums">
          <div className="text-sm font-bold text-[#0F172A]">
            {formatHHMM(clockMin)}
          </div>
          <div className="text-[10px] text-[#475569]">IST · 05:30–22:30</div>
        </div>
      </div>
    </div>
  );
}
