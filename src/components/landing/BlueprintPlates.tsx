/**
 * Layer metadata, leader callout anchors, and memoized isometric SVG plate
 * illustrations for the scroll-scrubbed exploded blueprint stack.
 */

"use client";

import { memo } from "react";

/** Architectural layer metadata rendered in the blueprint inspector and stack. */
export interface BlueprintLayerSpec {
  id: string;
  code: string;
  token: string;
  title: string;
  detail: string;
  accent: "cobalt" | "amber" | "crimson" | "emerald";
}

/** Six deterministic operational layers ordered bottom-to-top in painter's order. */
export const BLUEPRINT_LAYERS: readonly BlueprintLayerSpec[] = [
  { id: "india", code: "01", token: "india_16_airports", title: "16 Indian Airports", detail: "4 mega hubs, 4 regional hubs, 8 spoke airports.", accent: "cobalt" },
  { id: "tails", code: "02", token: "tail_chains_70", title: "70 Chained Flight Legs", detail: "16 aircraft tails sequenced by strict leg order.", accent: "cobalt" },
  { id: "turnaround", code: "03", token: "turnaround_30m", title: "30m Turnaround Absorption", detail: "Slack buffers absorb minor holds before cascading.", accent: "amber" },
  { id: "holding", code: "04", token: "atc_holding", title: "ATC Holding & GDP", detail: "Airborne arrivals orbit; pre-departure legs hold on gate.", accent: "amber" },
  { id: "crew", code: "05", token: "crew_duty_600m", title: "600m Legal Crew Cutoff", detail: "Exceeding duty limit grounds the flight and later legs.", accent: "crimson" },
  { id: "recovery", code: "06", token: "verified_recovery", title: "Verified Countermeasures", detail: "Spare swaps, round-trip cancels & regex-checked AI notes.", accent: "emerald" },
];

/** Configuration for a symmetric 45-degree elbow callout attached to an isometric plate. */
export interface BlueprintLeaderSpec {
  key: string;
  layerIdx: number;
  side: "left" | "right";
  isCrimson: boolean;
  computeLabelY: (getLayerY: (idx: number) => number) => number;
}

/** Eight technical callout specs balanced across the left and right blueprint margins. */
export const BLUEPRINT_LEADER_TEMPLATES: readonly BlueprintLeaderSpec[] = [
  { key: "india_16_airports", layerIdx: 0, side: "left", isCrimson: false, computeLabelY: (y) => y(0) + 12 },
  { key: "turnaround_30m", layerIdx: 2, side: "left", isCrimson: false, computeLabelY: (y) => y(2) },
  { key: "crew_duty_600m", layerIdx: 4, side: "left", isCrimson: true, computeLabelY: (y) => y(4) },
  { key: "zero_teleportation", layerIdx: 5, side: "left", isCrimson: false, computeLabelY: (y) => y(5) - 10 },
  { key: "tail_chains_70", layerIdx: 1, side: "right", isCrimson: false, computeLabelY: (y) => y(1) + 8 },
  { key: "pax_connections_21", layerIdx: 2, side: "right", isCrimson: false, computeLabelY: (y) => (y(2) + y(3)) / 2 + 12 },
  { key: "atc_holding", layerIdx: 3, side: "right", isCrimson: false, computeLabelY: (y) => y(3) - 10 },
  { key: "verified_recovery", layerIdx: 5, side: "right", isCrimson: false, computeLabelY: (y) => y(5) - 10 },
];

const INDIA_HUB_DOTS = [
  [-22, -38],
  [-42, 4],
  [-6, 36],
  [8, 12],
  [44, -8],
  [54, -22],
] as const;

const TURNAROUND_BARS = [-44, -14, 16, 46] as const;

/**
 * Memoized inner isometric technical drafting glyph for a single blueprint layer.
 */
export const BlueprintPlateArt = memo(function BlueprintPlateArt({
  layerIndex,
}: {
  layerIndex: number;
}) {
  if (layerIndex === 0) {
    return (
      <g>
        <polygon
          points="-10,-68 25,-48 58,-22 42,10 18,32 0,68 -24,38 -54,12 -64,-28 -36,-54"
          fill="#EFF6FF"
          stroke="#2B79FB"
          strokeWidth={1.8}
          strokeLinejoin="round"
        />
        {INDIA_HUB_DOTS.map(([dx, dy], dotIdx) => (
          <circle key={dotIdx} cx={dx} cy={dy} r={4.2} fill="#1D4ED8" stroke="#FFFFFF" strokeWidth={1.2} />
        ))}
      </g>
    );
  }

  if (layerIndex === 1) {
    return (
      <g fill="none" strokeLinecap="round">
        <path d="M-56,42 Q-10,-48 54,-26" stroke="#2B79FB" strokeWidth={2.2} />
        <path d="M-44,-44 Q18,-22 52,38" stroke="#2B79FB" strokeWidth={1.8} strokeOpacity={0.7} />
        <path d="M-58,-6 Q0,54 58,4" stroke="#D97706" strokeWidth={2.2} strokeDasharray="6 4" />
        <path d="M-24,-62 Q38,-14 14,58" stroke="#2B79FB" strokeWidth={1.6} strokeOpacity={0.55} />
      </g>
    );
  }

  if (layerIndex === 2) {
    return (
      <g>
        {TURNAROUND_BARS.map((yPos, barIdx) => (
          <g key={barIdx}>
            <rect x="-64" y={yPos - 8} width="128" height="16" rx="4" fill="#F8FAFC" stroke="#CBD5E1" strokeWidth={1} />
            <rect
              x="-58"
              y={yPos - 5}
              width={barIdx === 2 ? 78 : 54}
              height="10"
              rx="2"
              fill={barIdx === 2 ? "#D97706" : "#2B79FB"}
              fillOpacity={0.85}
            />
            <line x1={barIdx === 2 ? 26 : 4} y1={yPos - 7} x2={barIdx === 2 ? 26 : 4} y2={yPos + 7} stroke="#0F172A" strokeWidth={1.8} />
          </g>
        ))}
      </g>
    );
  }

  if (layerIndex === 3) {
    return (
      <g fill="none">
        <ellipse cx="0" cy="0" rx="58" ry="34" stroke="#D97706" strokeWidth={2.2} strokeDasharray="7 4" />
        <ellipse cx="0" cy="0" rx="38" ry="21" stroke="#D97706" strokeWidth={1.6} strokeOpacity={0.75} />
        <line x1="-72" y1="34" x2="-18" y2="34" stroke="#2B79FB" strokeWidth={2} />
        <circle cx="0" cy="0" r={6} fill="#DC2626" />
      </g>
    );
  }

  if (layerIndex === 4) {
    return (
      <g>
        <circle cx="-6" cy="0" r="50" fill="#FEF2F2" stroke="#DC2626" strokeWidth={2} />
        <path d="M-6,-36 L-6,0 L24,18" fill="none" stroke="#0F172A" strokeWidth={3} strokeLinecap="round" />
        <line x1="48" y1="-68" x2="48" y2="68" stroke="#DC2626" strokeWidth={3} strokeDasharray="6 4" />
      </g>
    );
  }

  return (
    <g>
      <polygon
        points="0,-58 50,-30 50,24 0,58 -50,24 -50,-30"
        fill="#ECFDF5"
        stroke="#059669"
        strokeWidth={2.4}
        strokeLinejoin="round"
      />
      <polyline
        points="-22,2 -5,20 26,-16"
        fill="none"
        stroke="#047857"
        strokeWidth={5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
});
