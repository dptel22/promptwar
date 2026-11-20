/**
 * Memoized interactive stage views rendered inside the sticky LandingModules bezel
 * for Tail-Chain Dominoes (Ch 0), Hub Exposure (Ch 1), and Verified Recovery (Ch 2).
 */

"use client";

import { memo } from "react";
import { CheckCircle2, ShieldAlert } from "lucide-react";
import { round2 } from "@/lib/geo";
import type { AirportFragilityRank } from "@/lib/ml/predict";
import { formatHHMM } from "@/lib/sim/constants";
import type { RecoveryEvaluation, SimulatedFlight } from "@/lib/sim/types";

/** Props for the Chapter 0 VT-DS03 tail-chain cascade bar chart. */
export interface TailCascadeStageProps {
  legs: SimulatedFlight[];
  chapterProgress: number;
}

/** Props for the Chapter 1 surrogate hub exposure ranking stage. */
export interface HubExposureStageProps {
  topHubs: AirportFragilityRank[];
  selectedHour: 8 | 12 | 16;
  onSelectHour: (hour: 8 | 12 | 16) => void;
  chapterProgress: number;
  reducedMotion: boolean;
}

/** Props for the Chapter 2 counterfactual rescue comparison stage. */
export interface RecoveryStageProps {
  rescueEval: RecoveryEvaluation;
  recoveryWindow: "am" | "pm";
  onSelectWindow: (window: "am" | "pm") => void;
  chapterProgress: number;
}

const AXIS_START = 720; // 12:00 IST
const AXIS_SPAN = 660; // 12:00..23:00 IST
const DUTY_LIMIT_PCT = round2(((1290 - AXIS_START) / AXIS_SPAN) * 100); // 21:30 IST = 1290m
const VERIFIED_CHECKS = ["Flight IDs matched", "Tail & crew clocks legal", "Zero aircraft teleportation"] as const;

/**
 * Chapter 0 visualization: interpolates VT-DS03 leg bars from scheduled to actual times
 * across the 21:30 IST crew duty cutoff line as chapter scroll progresses.
 */
export const TailCascadeStage = memo(function TailCascadeStage({
  legs,
  chapterProgress,
}: TailCascadeStageProps) {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E6EBF2] pb-3">
        <span className="font-mono text-xs font-semibold text-[#0F172A]">Tail VT-DS03 · Crew CR03 (600m duty wall @ 21:30 IST)</span>
        <span className="rounded bg-[#FEE2E2] px-2 py-0.5 font-mono text-[11px] font-semibold text-[#B91C1C]">BOM storm 15:00–16:30</span>
      </div>

      <div className="mt-4 space-y-3">
        {legs.map((leg) => {
          // Interpolate bar coordinates across chapterProgress so delayed legs visibly cross 21:30.
          const displayDep = leg.scheduledDepMin + (leg.actualDepMin - leg.scheduledDepMin) * chapterProgress;
          const displayArr = leg.scheduledArrMin + (leg.actualArrMin - leg.scheduledArrMin) * chapterProgress;
          const leftPct = round2(Math.max(0, ((displayDep - AXIS_START) / AXIS_SPAN) * 100));
          const rawWidthPct = round2(((displayArr - displayDep) / AXIS_SPAN) * 100);
          const clampedLeft = round2(Math.min(80, leftPct));
          const clampedWidth = round2(Math.min(100 - clampedLeft, Math.max(20, rawWidthPct)));
          const isBreach = leg.status === "CREW_BREACH";
          const isDelayed = leg.status === "DELAYED";
          const toneClass = isBreach
            ? "border-[#B91C1C] bg-[#FEE2E2] text-[#B91C1C]"
            : isDelayed ? "border-[#B45309] bg-[#FEF3C7] text-[#B45309]" : "border-[#1D4ED8]/40 bg-[#EFF6FF] text-[#1D4ED8]";

          return (
            <div key={leg.flight_id} className="grid grid-cols-12 items-center gap-3 text-xs">
              <div className="col-span-4 font-mono">
                <div className="font-semibold text-[#0F172A]">{leg.flight_id} · {leg.origin}→{leg.destination}</div>
                <div className="text-[11px] text-[#475569]">Sched {leg.dep}–{leg.arr}</div>
                <div className="text-[11px] font-medium text-[#334155]">Actual {formatHHMM(leg.actualDepMin)}–{formatHHMM(leg.actualArrMin)}</div>
              </div>
              <div className="col-span-8">
                <div className="relative h-9 overflow-hidden rounded-md border border-[#E6EBF2] bg-[#FBFCFD]">
                  <div className="absolute bottom-0 top-0 z-10 w-0.5 bg-[#DC2626]" style={{ left: `${DUTY_LIMIT_PCT}%` }} title="600m legal crew duty cutoff (21:30 IST)" />
                  <div className={`absolute top-1.5 flex h-6 items-center justify-center rounded border px-2 font-mono text-[10px] font-semibold whitespace-nowrap ${toneClass}`} style={{ left: `${clampedLeft}%`, width: `${clampedWidth}%`, minWidth: "20%" }}>
                    <span className="inline-flex items-center gap-1 whitespace-nowrap">
                      {isBreach ? <><ShieldAlert className="h-3 w-3 shrink-0" aria-hidden="true" />BREACH</> : isDelayed ? `+${leg.delayMin}m` : "ON TIME"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-between font-mono text-[11px] text-[#475569]">
        <span>12:00 IST</span>
        <span className="font-semibold text-[#B91C1C]">CR03 Duty Cutoff: 21:30 IST (600m)</span>
        <span>23:00 IST</span>
      </div>
    </div>
  );
});

/**
 * Chapter 1 visualization: staggered horizontal exposure index bars across the top 6 Indian hubs.
 */
export const HubExposureStage = memo(function HubExposureStage({
  topHubs,
  selectedHour,
  onSelectHour,
  chapterProgress,
  reducedMotion,
}: HubExposureStageProps) {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E6EBF2] pb-3">
        <div>
          <span className="font-mono text-xs font-semibold text-[#0F172A]">90m hub closure exposure index (0–100)</span>
          <div className="text-[11px] text-[#475569]">Downstream cascade sensitivity &amp; +30m crew cliff risk</div>
        </div>
        <div role="group" aria-label="Select departure wave hour" className="flex items-center gap-1">
          {([8, 12, 16] as const).map((hr) => (
            <button
              key={hr}
              type="button"
              aria-pressed={selectedHour === hr}
              onClick={() => onSelectHour(hr)}
              className={`cursor-pointer rounded-md border px-2.5 py-1 font-mono text-[11px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB] ${
                selectedHour === hr ? "border-[#1D4ED8] bg-[#EFF6FF] text-[#1D4ED8]" : "border-[#E6EBF2] bg-[#FBFCFD] text-[#475569] hover:text-[#0F172A]"
              }`}
            >
              {String(hr).padStart(2, "0")}:00
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {topHubs.map((hub, hubIdx) => {
          const barReveal = reducedMotion ? 1 : Math.max(0.12, Math.min(1, (chapterProgress * 1.15 - hubIdx * 0.08) / 0.45));
          const barColor = hub.fragilityScore >= 65 ? "bg-[#DC2626]" : hub.fragilityScore >= 32 ? "bg-[#D97706]" : "bg-[#2B79FB]";
          return (
            <div key={hub.airportId} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2"><span className="font-mono font-bold text-[#0F172A]">{hub.airportId}</span><span className="text-[#475569]">{hub.city}</span></div>
                <div className="flex items-center gap-3 font-mono tabular-nums"><span className="text-[11px] text-[#475569]">+30m cliff: {hub.extensionBreachProb}%</span><span className="w-8 text-right font-semibold text-[#0F172A]">{hub.fragilityScore}</span></div>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#F1F5F9]">
                <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.max(4, Math.round(hub.fragilityScore * barReveal))}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

/**
 * Chapter 2 visualization: live counterfactual before/after recovery deltas and verification gauge.
 */
export const RecoveryStage = memo(function RecoveryStage({
  rescueEval,
  recoveryWindow,
  onSelectWindow,
  chapterProgress,
}: RecoveryStageProps) {
  const bestRescue = rescueEval.candidates[0];
  const baseline = rescueEval.baseline.metrics;
  const after = bestRescue?.result.metrics ?? baseline;
  const deltaCards = [
    { label: "Stranded pax", before: baseline.totalStrandedPax, after: after.totalStrandedPax },
    { label: "Crew breaches", before: baseline.crewBreaches, after: after.crewBreaches },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E6EBF2] pb-3">
        <div>
          <span className="font-mono text-xs font-semibold text-[#0F172A]">{bestRescue?.title ?? "Deploy standby spare aircraft recovery"}</span>
          <div className="mt-0.5 inline-flex items-center gap-1 rounded border border-[#047857]/25 bg-[#ECFDF5] px-2 py-0.5 font-mono text-[11px] font-semibold text-[#047857]">
            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />Allow-list verified
          </div>
        </div>
        <div role="group" aria-label="Select Mumbai storm window" className="flex items-center gap-1">
          {([{ key: "am", label: "07:30–09:00" }, { key: "pm", label: "15:00–16:30" }] as const).map((win) => (
            <button
              key={win.key}
              type="button"
              aria-pressed={recoveryWindow === win.key}
              onClick={() => onSelectWindow(win.key)}
              className={`cursor-pointer rounded-md border px-2 py-1 font-mono text-[11px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB] ${
                recoveryWindow === win.key ? "border-[#1D4ED8] bg-[#EFF6FF] text-[#1D4ED8]" : "border-[#E6EBF2] bg-[#FBFCFD] text-[#475569] hover:text-[#0F172A]"
              }`}
            >
              {win.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {deltaCards.map((card) => (
          <div key={card.label} className="rounded-lg border border-[#E6EBF2] bg-[#FBFCFD] p-3.5">
            <div className="text-xs text-[#475569]">{card.label}</div>
            <div className="mt-1.5 flex items-baseline gap-2 font-mono text-xl font-bold tabular-nums">
              <span className="text-[#475569] line-through">{card.before}</span>
              <span className="text-[#047857]">{card.after}</span>
            </div>
          </div>
        ))}
        <div className="rounded-lg border border-[#E6EBF2] bg-[#FBFCFD] p-3.5">
          <div className="text-xs text-[#475569]">Delay delta</div>
          <div className="mt-1.5 font-mono text-xl font-bold tabular-nums text-[#1D4ED8]">{bestRescue?.deltas.totalDelayMinutesDelta ?? 0}m</div>
        </div>
      </div>

      <div className="mt-4 space-y-1">
        <div className="flex items-center justify-between font-mono text-[11px] text-[#475569]">
          <span>Rescue restoration progress</span>
          <span className="font-semibold text-[#047857]">{Math.round(chapterProgress * 100)}% verified</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-[#FEE2E2]">
          <div className="h-full rounded-full bg-[#047857]" style={{ width: `${Math.max(8, Math.round(chapterProgress * 100))}%` }} />
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-3 border-t border-[#E6EBF2] pt-3 font-mono text-[11px] text-[#047857]">
        {VERIFIED_CHECKS.map((label) => (
          <span key={label} className="inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />{label}</span>
        ))}
      </div>
    </div>
  );
});
