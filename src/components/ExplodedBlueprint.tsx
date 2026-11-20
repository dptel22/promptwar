"use client";

import { useEffect, useRef, useState } from "react";

interface LayerSpec {
  id: string;
  code: string;
  token: string;
  title: string;
  detail: string;
  accent: "cobalt" | "amber" | "crimson" | "emerald";
}

const LAYERS: LayerSpec[] = [
  {
    id: "india",
    code: "01",
    token: "india_16_airports",
    title: "16 Indian Airports",
    detail: "4 mega hubs, 4 regional hubs, 8 spoke airports.",
    accent: "cobalt",
  },
  {
    id: "tails",
    code: "02",
    token: "tail_chains_70",
    title: "70 Chained Flight Legs",
    detail: "16 aircraft tails sequenced by strict leg order.",
    accent: "cobalt",
  },
  {
    id: "turnaround",
    code: "03",
    token: "turnaround_30m",
    title: "30m Turnaround Absorption",
    detail: "Slack buffers absorb minor holds before cascading.",
    accent: "amber",
  },
  {
    id: "holding",
    code: "04",
    token: "atc_holding",
    title: "ATC Holding & GDP",
    detail: "Airborne arrivals orbit; pre-departure legs hold on gate.",
    accent: "amber",
  },
  {
    id: "crew",
    code: "05",
    token: "crew_duty_600m",
    title: "600m Legal Crew Cutoff",
    detail: "Exceeding duty limit grounds the flight and later legs.",
    accent: "crimson",
  },
  {
    id: "recovery",
    code: "06",
    token: "verified_recovery",
    title: "Verified Countermeasures",
    detail: "Spare swaps, round-trip cancels & regex-checked AI notes.",
    accent: "emerald",
  },
];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const SCRUBBER_TICKS = Array.from({ length: 32 }, (_, i) => i);

export function ExplodedBlueprint() {
  const sectionRef = useRef<HTMLElement>(null);
  const [progress, setProgress] = useState<number>(0.85);
  const [pinnedLayer, setPinnedLayer] = useState<number | null>(null);
  const [reducedMotion, setReducedMotion] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");

    const update = () => {
      if (mq.matches) {
        setReducedMotion(true);
        setProgress(0.85);
        return;
      }
      setReducedMotion(false);
      const el = sectionRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight || 800;
      const totalTravel = Math.max(1, el.offsetHeight - vh * 0.65);
      const raw = (vh * 0.35 - rect.top) / totalTravel;
      const clamped = Math.round(Math.max(0, Math.min(1, raw)) * 1000) / 1000;
      setProgress(clamped);
    };

    update();
    mq.addEventListener("change", update);
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update, { passive: true });
    return () => {
      mq.removeEventListener("change", update);
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  const scrollLayerIdx = Math.min(5, Math.floor(progress * 5.99));
  const activeLayerIdx = pinnedLayer ?? scrollLayerIdx;

  // Compute Y coordinates for 6 isometric plates (0 = bottom, 5 = top)
  const plateGap = 14 + progress * 38;
  const plateYs = LAYERS.map((_, i) => round2(268 + (2.5 - i) * plateGap));

  // Outer label anchor Y coordinates (smoothly spread even at progress=0)
  const labelGap = 30 + progress * 26;
  const getLabelY = (idx: number) => round2(268 + (2.5 - idx) * labelGap);

  const leaderSpecs = [
    {
      key: "india_16_airports",
      layerIdx: 0,
      side: "left" as const,
      labelY: round2(getLabelY(0) + 12),
      isCrimson: false,
    },
    {
      key: "turnaround_30m",
      layerIdx: 2,
      side: "left" as const,
      labelY: getLabelY(2),
      isCrimson: false,
    },
    {
      key: "crew_duty_600m",
      layerIdx: 4,
      side: "left" as const,
      labelY: getLabelY(4),
      isCrimson: true,
    },
    {
      key: "zero_teleportation",
      layerIdx: 5,
      side: "left" as const,
      labelY: round2(getLabelY(5) - 10),
      isCrimson: false,
    },
    {
      key: "tail_chains_70",
      layerIdx: 1,
      side: "right" as const,
      labelY: round2(getLabelY(1) + 8),
      isCrimson: false,
    },
    {
      key: "pax_connections_21",
      layerIdx: 2,
      side: "right" as const,
      labelY: round2((getLabelY(2) + getLabelY(3)) / 2 + 12),
      isCrimson: false,
    },
    {
      key: "atc_holding",
      layerIdx: 3,
      side: "right" as const,
      labelY: round2(getLabelY(3) - 10),
      isCrimson: false,
    },
    {
      key: "verified_recovery",
      layerIdx: 5,
      side: "right" as const,
      labelY: round2(getLabelY(5) - 10),
      isCrimson: false,
    },
  ];

  const activeTickIdx = Math.min(31, Math.round(progress * 31));

  return (
    <section
      id="architecture"
      ref={sectionRef}
      aria-label="Exploded deterministic aviation engine stack"
      className="blueprint-paper border-y border-[#D6D0C4] text-[#0F172A]"
    >
      <div className="mx-auto max-w-6xl px-4 py-14 md:min-h-[165vh] md:py-0 lg:px-8">
        <div className="md:sticky md:top-14 md:flex md:min-h-[calc(100vh-3.5rem)] md:items-center md:py-4">
          <div className="grid w-full items-center gap-10 lg:grid-cols-12">
            {/* Left Editorial Column */}
            <div className="max-w-sm lg:col-span-4">
              <div className="font-mono text-xs font-semibold uppercase tracking-wider text-[#1D4ED8]">
                02 · Architecture Stack
              </div>
              <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-[#0F172A] sm:text-4xl">
                The complete Indian OCC engine.
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-[#334155]">
                Every disruption propagates deterministically through six
                coupled operational layers—from 16 Indian airports and 70
                chained flights to 30-minute turnaround buffers, ATC holding,
                and legal crew clocks.
              </p>

              {/* Layer Inspector Chips */}
              <div className="mt-6 space-y-1.5">
                {LAYERS.map((layer, idx) => {
                  const isActive = activeLayerIdx === idx;
                  const isCrew = layer.accent === "crimson";
                  return (
                    <button
                      key={layer.id}
                      type="button"
                      aria-pressed={isActive}
                      onClick={() =>
                        setPinnedLayer((prev) => (prev === idx ? null : idx))
                      }
                      className={`flex w-full cursor-pointer items-center justify-between rounded-md border px-3 py-2 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB] ${
                        isActive
                          ? isCrew
                            ? "border-[#B91C1C]/40 bg-[#FEE2E2] text-[#B91C1C]"
                            : "border-[#1D4ED8]/40 bg-[#FFFFFF] text-[#1D4ED8] shadow-xs"
                          : "border-[#D6D0C4] bg-[#F5F2EC]/80 text-[#334155] hover:bg-[#FFFFFF]"
                      }`}
                    >
                      <span className="flex items-center gap-2.5">
                        <span className="font-mono text-[11px] font-bold">
                          {layer.code}
                        </span>
                        <span className="text-xs font-semibold">
                          {layer.title}
                        </span>
                      </span>
                      <span className="font-mono text-[10px]">
                        {layer.token}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Center Isometric 6-Layer Exploded Stack */}
            <div className="relative lg:col-span-8">
              <div className="relative mx-auto w-full max-w-[680px]">
                <svg
                  viewBox="0 -26 680 580"
                  className="h-auto w-full select-none"
                  role="img"
                  aria-label="Scroll-scrubbed six-layer isometric diagram of the Domino Sky deterministic cascade engine"
                >
                  <title>
                    Domino Sky 6-Layer Isometric Cascade Architecture
                  </title>

                  {/* Central Vertical Guide Spine */}
                  <line
                    x1="340"
                    y1={round2(plateYs[5] - 32)}
                    x2="340"
                    y2={round2(plateYs[0] + 42)}
                    stroke="#C5BEB0"
                    strokeWidth={1}
                    strokeDasharray="4 4"
                  />

                  {/* 6 Isometric Plates in Painter's Order (Bottom 0 -> Top 5) */}
                  {LAYERS.map((layer, i) => {
                    const cy = plateYs[i];
                    const isActive = activeLayerIdx === i;
                    const isPast = i <= activeLayerIdx;
                    const isCrew = layer.accent === "crimson";
                    const strokeColor = isActive
                      ? isCrew
                        ? "#B91C1C"
                        : "#1D4ED8"
                      : isPast
                        ? "#475569"
                        : "#94A3B8";
                    const plateFill = isActive ? "#FFFFFF" : "#F8F6F2";

                    return (
                      <g key={layer.id}>
                        {/* Lower Extruded Rim */}
                        <g
                          transform={`translate(340, ${round2(cy + 7)}) scale(1, 0.54) rotate(-45)`}
                        >
                          <rect
                            x="-102"
                            y="-102"
                            width="204"
                            height="204"
                            rx="22"
                            fill="#D4CEC3"
                            stroke="#B8B0A2"
                            strokeWidth={1}
                          />
                        </g>

                        {/* Top Isometric Plate */}
                        <g
                          transform={`translate(340, ${cy}) scale(1, 0.54) rotate(-45)`}
                        >
                          <rect
                            x="-102"
                            y="-102"
                            width="204"
                            height="204"
                            rx="22"
                            fill={plateFill}
                            fillOpacity={0.96}
                            stroke={strokeColor}
                            strokeWidth={isActive ? 2.4 : 1.4}
                          />

                          {/* Inner Drafting Perimeter */}
                          <rect
                            x="-88"
                            y="-88"
                            width="176"
                            height="176"
                            rx="14"
                            fill="none"
                            stroke="#E2DDD3"
                            strokeWidth={1}
                          />

                          {/* Layer-Specific Technical Drafting Geometry */}
                          {i === 0 && (
                            <g>
                              <polygon
                                points="-10,-68 25,-48 58,-22 42,10 18,32 0,68 -24,38 -54,12 -64,-28 -36,-54"
                                fill="#EFF6FF"
                                stroke="#2B79FB"
                                strokeWidth={1.8}
                                strokeLinejoin="round"
                              />
                              {[
                                [-22, -38],
                                [-42, 4],
                                [-6, 36],
                                [8, 12],
                                [44, -8],
                                [54, -22],
                              ].map(([dx, dy], dotIdx) => (
                                <circle
                                  key={dotIdx}
                                  cx={dx}
                                  cy={dy}
                                  r={4.2}
                                  fill="#1D4ED8"
                                  stroke="#FFFFFF"
                                  strokeWidth={1.2}
                                />
                              ))}
                            </g>
                          )}

                          {i === 1 && (
                            <g fill="none" strokeLinecap="round">
                              <path
                                d="M-56,42 Q-10,-48 54,-26"
                                stroke="#2B79FB"
                                strokeWidth={2.2}
                              />
                              <path
                                d="M-44,-44 Q18,-22 52,38"
                                stroke="#2B79FB"
                                strokeWidth={1.8}
                                strokeOpacity={0.7}
                              />
                              <path
                                d="M-58,-6 Q0,54 58,4"
                                stroke="#D97706"
                                strokeWidth={2.2}
                                strokeDasharray="6 4"
                              />
                              <path
                                d="M-24,-62 Q38,-14 14,58"
                                stroke="#2B79FB"
                                strokeWidth={1.6}
                                strokeOpacity={0.55}
                              />
                            </g>
                          )}

                          {i === 2 && (
                            <g>
                              {[-44, -14, 16, 46].map((yPos, barIdx) => (
                                <g key={barIdx}>
                                  <rect
                                    x="-64"
                                    y={yPos - 8}
                                    width="128"
                                    height="16"
                                    rx="4"
                                    fill="#F8FAFC"
                                    stroke="#CBD5E1"
                                    strokeWidth={1}
                                  />
                                  <rect
                                    x="-58"
                                    y={yPos - 5}
                                    width={barIdx === 2 ? 78 : 54}
                                    height="10"
                                    rx="2"
                                    fill={barIdx === 2 ? "#D97706" : "#2B79FB"}
                                    fillOpacity={0.85}
                                  />
                                  <line
                                    x1={barIdx === 2 ? 26 : 4}
                                    y1={yPos - 7}
                                    x2={barIdx === 2 ? 26 : 4}
                                    y2={yPos + 7}
                                    stroke="#0F172A"
                                    strokeWidth={1.8}
                                  />
                                </g>
                              ))}
                            </g>
                          )}

                          {i === 3 && (
                            <g fill="none">
                              <ellipse
                                cx="0"
                                cy="0"
                                rx="58"
                                ry="34"
                                stroke="#D97706"
                                strokeWidth={2.2}
                                strokeDasharray="7 4"
                              />
                              <ellipse
                                cx="0"
                                cy="0"
                                rx="38"
                                ry="21"
                                stroke="#D97706"
                                strokeWidth={1.6}
                                strokeOpacity={0.75}
                              />
                              <line
                                x1="-72"
                                y1="34"
                                x2="-18"
                                y2="34"
                                stroke="#2B79FB"
                                strokeWidth={2}
                              />
                              <circle cx="0" cy="0" r={6} fill="#DC2626" />
                            </g>
                          )}

                          {i === 4 && (
                            <g>
                              <circle
                                cx="-6"
                                cy="0"
                                r="50"
                                fill="#FEF2F2"
                                stroke="#DC2626"
                                strokeWidth={2}
                              />
                              <path
                                d="M-6,-36 L-6,0 L24,18"
                                fill="none"
                                stroke="#0F172A"
                                strokeWidth={3}
                                strokeLinecap="round"
                              />
                              <line
                                x1="48"
                                y1="-68"
                                x2="48"
                                y2="68"
                                stroke="#DC2626"
                                strokeWidth={3}
                                strokeDasharray="6 4"
                              />
                            </g>
                          )}

                          {i === 5 && (
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
                          )}
                        </g>
                      </g>
                    );
                  })}

                  {/* Symmetric 45°-Elbow Leader Lines & Monospace Labels */}
                  {leaderSpecs.map((spec) => {
                    const plateY = plateYs[spec.layerIdx];
                    const isActive = activeLayerIdx === spec.layerIdx;
                    const strokeColor = isActive
                      ? spec.isCrimson
                        ? "#B91C1C"
                        : "#1D4ED8"
                      : "#64748B";
                    const textColor = isActive
                      ? spec.isCrimson
                        ? "#B91C1C"
                        : "#1D4ED8"
                      : "#334155";

                    if (spec.side === "left") {
                      const anchorX = 212;
                      const dy = Math.abs(spec.labelY - plateY);
                      const elbowX = round2(Math.max(162, anchorX - Math.max(20, dy)));
                      return (
                        <g key={spec.key}>
                          <polyline
                            points={`${anchorX},${plateY} ${elbowX},${spec.labelY} 154,${spec.labelY}`}
                            fill="none"
                            stroke={strokeColor}
                            strokeWidth={isActive ? 1.6 : 1}
                            strokeOpacity={isActive ? 1 : 0.72}
                          />
                          <circle
                            cx={anchorX}
                            cy={plateY}
                            r={2.5}
                            fill={strokeColor}
                          />
                          <text
                            x="146"
                            y={spec.labelY}
                            textAnchor="end"
                            dominantBaseline="central"
                            fontSize={10.5}
                            fontFamily="var(--font-mono)"
                            fontWeight={isActive ? 700 : 500}
                            fill={textColor}
                          >
                            {spec.key}
                          </text>
                        </g>
                      );
                    }

                    const anchorX = 468;
                    const dy = Math.abs(spec.labelY - plateY);
                    const elbowX = round2(Math.min(518, anchorX + Math.max(20, dy)));
                    return (
                      <g key={spec.key}>
                        <polyline
                          points={`${anchorX},${plateY} ${elbowX},${spec.labelY} 526,${spec.labelY}`}
                          fill="none"
                          stroke={strokeColor}
                          strokeWidth={isActive ? 1.6 : 1}
                          strokeOpacity={isActive ? 1 : 0.72}
                        />
                        <circle
                          cx={anchorX}
                          cy={plateY}
                          r={2.5}
                          fill={strokeColor}
                        />
                        <text
                          x="534"
                          y={spec.labelY}
                          textAnchor="start"
                          dominantBaseline="central"
                          fontSize={10.5}
                          fontFamily="var(--font-mono)"
                          fontWeight={isActive ? 700 : 500}
                          fill={textColor}
                        >
                          {spec.key}
                        </text>
                      </g>
                    );
                  })}
                </svg>

                {/* Bottom-Right Dark-Ink Tick-Ruler Scrubber */}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="font-mono text-[11px] text-[#334155]">
                    {reducedMotion
                      ? "Static blueprint inspection mode"
                      : LAYERS[activeLayerIdx]?.detail}
                  </div>

                  <div
                    aria-label="Exploded blueprint scroll depth ruler"
                    className="ml-auto flex items-center gap-3 rounded-lg bg-[#1E2430] px-3 py-2 text-white shadow-sm"
                  >
                    <span className="font-mono text-[11px] font-semibold tabular-nums text-[#F8FAFC]">
                      {LAYERS[activeLayerIdx]?.code}/06
                    </span>
                    <div className="flex items-center gap-[3px]">
                      {SCRUBBER_TICKS.map((tick) => {
                        const isCursor = tick === activeTickIdx;
                        const isPassed = tick < activeTickIdx;
                        const cursorColor =
                          progress > 0.65 ? "bg-[#DC2626]" : "bg-[#2B79FB]";
                        return (
                          <span
                            key={tick}
                            className={`w-[1.5px] rounded-full transition-colors duration-100 ${
                              isCursor
                                ? `h-3.5 ${cursorColor}`
                                : isPassed
                                  ? "h-2.5 bg-[#CBD5E1]"
                                  : tick % 8 === 0
                                    ? "h-2.5 bg-[#64748B]"
                                    : "h-1.5 bg-[#475569]"
                            }`}
                          />
                        );
                      })}
                    </div>
                    <span className="font-mono text-[11px] tabular-nums text-[#CBD5E1]">
                      {Math.round(progress * 100)}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
