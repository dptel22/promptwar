"use client";

import { FastForward, Pause, Play } from "lucide-react";
import { formatHHMM } from "@/lib/sim/engine";
import type { AirportClosure } from "@/lib/sim/types";

export const CLOCK_MIN = 330; // 05:30 IST
export const CLOCK_MAX = 1350; // 22:30 IST

interface TimelineScrubberProps {
  clockMin: number;
  isPlaying: boolean;
  speed: number;
  closures: AirportClosure[];
  onChangeClock: (min: number) => void;
  onTogglePlay: () => void;
  onCycleSpeed: () => void;
}

export function TimelineScrubber({
  clockMin,
  isPlaying,
  speed,
  closures,
  onChangeClock,
  onTogglePlay,
  onCycleSpeed,
}: TimelineScrubberProps) {
  const span = CLOCK_MAX - CLOCK_MIN;

  return (
    <div
      className="absolute bottom-3 left-1/2 z-10 flex w-[min(640px,calc(100%-24px))] -translate-x-1/2 items-center gap-3 rounded-lg border border-[#222C38] bg-[#11161D] px-3 py-2 shadow-xl"
      role="region"
      aria-label="Simulation clock controls"
    >
      <button
        type="button"
        onClick={onTogglePlay}
        aria-label={isPlaying ? "Pause radar playback" : "Play radar playback"}
        className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md bg-[#F59E0B] text-[#090D12] transition-colors duration-150 hover:bg-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
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
        title="Cycle simulation playback speed"
        className="flex h-8 shrink-0 cursor-pointer items-center gap-1 rounded-md border border-[#222C38] bg-[#18202A] px-2 font-mono text-xs font-medium text-[#F1F5F9] transition-colors duration-150 hover:bg-[#1F2937] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
      >
        <FastForward className="h-3 w-3 text-amber-400" aria-hidden="true" />
        <span>{speed}x</span>
      </button>

      <div className="relative flex flex-1 flex-col justify-center">
        {/* Closure bands overlay on track */}
        <div
          className="pointer-events-none absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-sm bg-[#18202A]"
          aria-hidden="true"
        >
          {closures.map((c) => {
            const left = Math.max(0, ((c.startMin - CLOCK_MIN) / span) * 100);
            const right = Math.min(100, ((c.endMin - CLOCK_MIN) / span) * 100);
            return (
              <div
                key={c.id}
                className="absolute top-0 bottom-0 bg-[#EF4444]/65"
                style={{ left: `${left}%`, width: `${Math.max(1, right - left)}%` }}
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
          className="relative z-10 h-4 w-full cursor-pointer appearance-none bg-transparent accent-amber-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
        />
      </div>

      <div className="shrink-0 text-right font-mono tabular-nums">
        <div className="text-xs font-bold text-[#FBBF24]">
          {formatHHMM(clockMin)} IST
        </div>
        <div className="text-[10px] text-[#94A3B8]">05:30–22:30</div>
      </div>
    </div>
  );
}
