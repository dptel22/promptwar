/**
 * Scroll-scrubbed six-layer isometric architecture diagram on warm drafting paper.
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { round2 } from "@/lib/geo";
import { BLUEPRINT_LAYERS, BLUEPRINT_LEADER_TEMPLATES, BlueprintPlateArt } from "./landing/BlueprintPlates";

const SCRUBBER_TICKS = Array.from({ length: 32 }, (_, i) => i);

/**
 * Renders the interactive exploded blueprint section with sticky scroll separation,
 * clickable layer chips, self-drawing leader lines, and a 32-tick depth ruler.
 */
export function ExplodedBlueprint() {
  const sectionRef = useRef<HTMLElement>(null);
  const [progress, setProgress] = useState(0.08);
  const [pinnedLayer, setPinnedLayer] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let rafId = 0;

    const update = () => {
      const el = sectionRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight || 800;
      const scrollable = Math.max(180, el.offsetHeight - vh * 0.65);
      const raw = (vh * 0.35 - rect.top) / scrollable;
      setProgress(Math.round(Math.max(0, Math.min(1, raw)) * 1000) / 1000);
    };

    const scheduleUpdate = () => {
      // Coalesce high-frequency scroll/resize reads onto one RAF frame for 60fps smoothness.
      if (rafId !== 0) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        update();
      });
    };

    update();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate, { passive: true });
    return () => {
      if (rafId !== 0) window.cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, []);

  const activeLayerIdx = pinnedLayer ?? Math.min(5, Math.floor(progress * 5.99));
  // Dramatic 1:1 scroll-driven vertical plate separation (compact 10px -> expanded 54px).
  const plateGap = 10 + progress * 44;
  const plateYs = BLUEPRINT_LAYERS.map((_, i) =>
    round2(268 + (2.5 - i) * plateGap - (activeLayerIdx === i ? 5 : 0))
  );
  const labelGap = 28 + progress * 28;
  const getLabelY = (idx: number) => round2(268 + (2.5 - idx) * labelGap);
  const activeTickIdx = Math.min(31, Math.round(progress * 31));

  return (
    <section
      id="architecture"
      ref={sectionRef}
      aria-label="Exploded deterministic aviation engine stack"
      className="blueprint-paper border-y border-[#D6D0C4] text-[#0F172A]"
    >
      <div className="mx-auto max-w-6xl px-4 py-10 lg:min-h-[145vh] lg:px-8 lg:py-12">
        <div className="lg:sticky lg:top-16">
          <div className="grid w-full items-center gap-8 lg:grid-cols-12">
            {/* Left Editorial Column */}
            <div className="max-w-sm lg:col-span-4">
              <div className="font-mono text-xs font-semibold uppercase tracking-wider text-[#1D4ED8]">02 · Architecture Stack</div>
              <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-[#0F172A] sm:text-4xl">The complete Indian OCC engine.</h2>
              <p className="mt-4 text-sm leading-relaxed text-[#334155]">
                Every disruption propagates deterministically through six coupled operational layers—from 16 Indian airports and 70 chained flights to 30-minute turnaround buffers, ATC holding, and legal crew clocks.
              </p>

              <div className="mt-6 space-y-1.5">
                {BLUEPRINT_LAYERS.map((layer, idx) => {
                  const isActive = activeLayerIdx === idx;
                  const activeCls =
                    layer.accent === "crimson"
                      ? "border-[#B91C1C]/40 bg-[#FEE2E2] text-[#B91C1C]"
                      : "border-[#1D4ED8]/40 bg-[#FFFFFF] text-[#1D4ED8] shadow-xs";
                  return (
                    <button
                      key={layer.id}
                      type="button"
                      aria-pressed={isActive}
                      onClick={() => setPinnedLayer((prev) => (prev === idx ? null : idx))}
                      className={`flex w-full cursor-pointer items-center justify-between rounded-md border px-3 py-2 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB] ${
                        isActive ? activeCls : "border-[#D6D0C4] bg-[#F5F2EC]/80 text-[#334155] hover:bg-[#FFFFFF]"
                      }`}
                    >
                      <span className="flex items-center gap-2.5">
                        <span className="font-mono text-[11px] font-bold">{layer.code}</span>
                        <span className="text-xs font-semibold">{layer.title}</span>
                      </span>
                      <span className="font-mono text-[10px]">{layer.token}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Center Isometric 6-Layer Exploded Stack */}
            <div className="relative lg:col-span-8">
              <div className="relative mx-auto w-full max-w-[680px]">
                <svg viewBox="0 -26 680 580" className="h-auto w-full select-none" role="img" aria-label="Scroll-scrubbed six-layer isometric diagram of the Domino Sky deterministic cascade engine">
                  <title>Domino Sky 6-Layer Isometric Cascade Architecture</title>
                  <line x1="340" y1={round2(plateYs[5] - 32)} x2="340" y2={round2(plateYs[0] + 42)} stroke="#C5BEB0" strokeWidth={1} strokeDasharray="4 4" />

                  {BLUEPRINT_LAYERS.map((layer, i) => {
                    const cy = plateYs[i];
                    const isActive = activeLayerIdx === i;
                    const strokeColor = isActive ? (layer.accent === "crimson" ? "#B91C1C" : "#1D4ED8") : i <= activeLayerIdx ? "#475569" : "#94A3B8";
                    return (
                      <g key={layer.id}>
                        <g transform={`translate(340, ${round2(cy + 7)}) scale(1, 0.54) rotate(-45)`}>
                          <rect x="-102" y="-102" width="204" height="204" rx="22" fill="#D4CEC3" stroke="#B8B0A2" strokeWidth={1} />
                        </g>
                        <g transform={`translate(340, ${cy}) scale(1, 0.54) rotate(-45)`}>
                          <rect x="-102" y="-102" width="204" height="204" rx="22" fill={isActive ? "#FFFFFF" : "#F8F6F2"} fillOpacity={0.96} stroke={strokeColor} strokeWidth={isActive ? 2.4 : 1.4} />
                          <rect x="-88" y="-88" width="176" height="176" rx="14" fill="none" stroke="#E2DDD3" strokeWidth={1} />
                          <BlueprintPlateArt layerIndex={i} />
                        </g>
                      </g>
                    );
                  })}

                  {BLUEPRINT_LEADER_TEMPLATES.map((spec, specIdx) => {
                    const plateY = plateYs[spec.layerIdx];
                    const labelY = round2(spec.computeLabelY(getLabelY));
                    const isActive = activeLayerIdx === spec.layerIdx;
                    const lineReveal = Math.max(0.12, Math.min(1, (progress * 1.25 - specIdx * 0.08) / 0.35));
                    const strokeColor = isActive ? (spec.isCrimson ? "#B91C1C" : "#1D4ED8") : "#64748B";
                    const textColor = isActive ? (spec.isCrimson ? "#B91C1C" : "#1D4ED8") : "#334155";
                    const isLeft = spec.side === "left";
                    const anchorX = isLeft ? 212 : 468;
                    const dy = Math.abs(labelY - plateY);
                    const elbowX = round2(isLeft ? Math.max(162, anchorX - Math.max(20, dy)) : Math.min(518, anchorX + Math.max(20, dy)));

                    return (
                      <g key={spec.key}>
                        <polyline
                          points={`${anchorX},${plateY} ${elbowX},${labelY} ${isLeft ? 154 : 526},${labelY}`}
                          fill="none"
                          stroke={strokeColor}
                          strokeWidth={isActive ? 1.75 : 1.05}
                          strokeOpacity={isActive ? 1 : 0.75}
                          pathLength={100}
                          strokeDasharray="100"
                          strokeDashoffset={round2(100 * (1 - lineReveal))}
                        />
                        <circle cx={anchorX} cy={plateY} r={2.5} fill={strokeColor} />
                        <text x={isLeft ? 146 : 534} y={labelY} textAnchor={isLeft ? "end" : "start"} dominantBaseline="central" fontSize={10.5} fontFamily="var(--font-mono)" fontWeight={isActive ? 700 : 500} fill={textColor} fillOpacity={round2(0.28 + 0.72 * lineReveal)}>
                          {spec.key}
                        </text>
                      </g>
                    );
                  })}
                </svg>

                {/* Bottom-Right Dark-Ink Tick-Ruler Scrubber */}
                <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                  <div className="font-mono text-[11px] text-[#334155]">
                    {BLUEPRINT_LAYERS[activeLayerIdx]?.detail}
                  </div>
                  <div aria-label="Exploded blueprint scroll depth ruler" className="ml-auto flex items-center gap-3 rounded-lg bg-[#1E2430] px-3 py-2 text-white shadow-sm">
                    <span className="font-mono text-[11px] font-semibold tabular-nums text-[#F8FAFC]">{BLUEPRINT_LAYERS[activeLayerIdx]?.code}/06</span>
                    <div className="flex items-center gap-[3px]">
                      {SCRUBBER_TICKS.map((tick) => {
                        const cls =
                          tick === activeTickIdx
                            ? `h-3.5 ${progress > 0.65 ? "bg-[#DC2626]" : "bg-[#2B79FB]"}`
                            : tick < activeTickIdx ? "h-2.5 bg-[#CBD5E1]" : tick % 8 === 0 ? "h-2.5 bg-[#64748B]" : "h-1.5 bg-[#475569]";
                        return <span key={tick} className={`w-[1.5px] rounded-full transition-colors duration-100 ${cls}`} />;
                      })}
                    </div>
                    <span className="font-mono text-[11px] tabular-nums text-[#CBD5E1]">{Math.round(progress * 100)}%</span>
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
