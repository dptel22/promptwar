"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, ShieldAlert } from "lucide-react";
import { predictAllAirportFragilities } from "@/lib/ml/predict";
import { formatHHMM, parseHHMM, simulateNetwork } from "@/lib/sim/engine";
import { evaluateRecoveryCandidates } from "@/lib/sim/recovery";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: round2(cx + r * Math.cos(rad)),
    y: round2(cy + r * Math.sin(rad)),
  };
}

function describeArc(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number
): string {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
}

const BEZEL_TICKS = Array.from({ length: 72 }, (_, idx) => {
  const deg = idx * 5;
  const isMajor = idx % 6 === 0;
  const p1 = polarToCartesian(260, 260, isMajor ? 242 : 247, deg);
  const p2 = polarToCartesian(260, 260, 254, deg);
  return { idx, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, isMajor };
});

const CHAPTER_META = [
  {
    idx: 0 as const,
    code: "01",
    eyebrow: "Tail-chain dominoes",
    colorClass: "text-[#B45309]",
    accentHex: "#D97706",
    arcRotation: 0,
    title: "Tail-chain dominoes",
    description:
      "Every aircraft flies 4–5 chained legs with a strict 30-minute minimum turnaround. Slack buffers absorb small holds, but a 90-minute storm at Mumbai cascades leg-by-leg down the chain.",
    bullets: [
      "16 chained aircraft tails",
      "Explicit buffer absorption",
      "Fixed-point cascade convergence",
    ],
    href: "/simulator?preset=bom-pm-crew&view=advanced",
    linkLabel: "Inspect VT-DS03 in simulator",
  },
  {
    idx: 1 as const,
    code: "02",
    eyebrow: "Crew & spoke cliffs",
    colorClass: "text-[#B91C1C]",
    accentHex: "#DC2626",
    arcRotation: 120,
    title: "600m crew & spoke cliffs",
    description:
      "Delayed turnarounds collide with hard 600-minute legal crew duty walls (such as CR03 on DS0304), while true spoke closures like Guwahati stay isolated to Northeast chains.",
    bullets: [
      "Legal 600-min duty cutoffs",
      "True hub vs spoke isolation",
      "Inclusion-exclusion pax math",
    ],
    href: "/simulator?preset=gau-spoke",
    linkLabel: "Simulate GAU spoke isolation",
  },
  {
    idx: 2 as const,
    code: "03",
    eyebrow: "Verified countermeasures",
    colorClass: "text-[#047857]",
    accentHex: "#059669",
    arcRotation: 240,
    title: "Zero-hallucination recovery",
    description:
      "Physically legal spare swaps (VT-DS17 at BLR, VT-DS18 at DEL), round-trip cancellations, and 45-minute connection holds are simulated deterministically and checked by a regex token allow-list.",
    bullets: [
      "Live before/after ghost arcs",
      "Regex token verification",
      "Instant apply & full undo",
    ],
    href: "/simulator?preset=bom-90m",
    linkLabel: "Run live recovery preview",
  },
] as const;

export function LandingModules() {
  const [activeChapter, setActiveChapter] = useState<0 | 1 | 2>(0);
  const [selectedHour, setSelectedHour] = useState<8 | 12 | 16>(8);
  const [recoveryWindow, setRecoveryWindow] = useState<"am" | "pm">("am");

  const ch0Ref = useRef<HTMLDivElement>(null);
  const ch1Ref = useRef<HTMLDivElement>(null);
  const ch2Ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) {
      return;
    }

    const targets = [
      { idx: 0 as const, el: ch0Ref.current },
      { idx: 1 as const, el: ch1Ref.current },
      { idx: 2 as const, el: ch2Ref.current },
    ];

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const found = targets.find((t) => t.el === entry.target);
            if (found) setActiveChapter(found.idx);
          }
        }
      },
      {
        rootMargin: "-35% 0px -45% 0px",
        threshold: 0.15,
      }
    );

    for (const t of targets) {
      if (t.el) observer.observe(t.el);
    }

    return () => observer.disconnect();
  }, []);

  function jumpToChapter(idx: 0 | 1 | 2) {
    setActiveChapter(idx);
    const refs = [ch0Ref.current, ch1Ref.current, ch2Ref.current];
    const target = refs[idx];
    if (target) {
      const reduced = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;
      target.scrollIntoView({
        behavior: reduced ? "auto" : "smooth",
        block: "center",
      });
    }
  }

  // Chapter 0 deterministic computation: BOM 15:00-16:30 impacting VT-DS03
  const vt03Sim = useMemo(
    () =>
      simulateNetwork([
        {
          id: "story-bom-pm",
          airportId: "BOM",
          startMin: parseHHMM("15:00"),
          endMin: parseHHMM("16:30"),
        },
      ]),
    []
  );

  const vt03Legs = useMemo(
    () =>
      vt03Sim.flights
        .filter((f) => f.tail_id === "VT-DS03")
        .sort((a, b) => a.leg_order - b.leg_order),
    [vt03Sim]
  );

  // Chapter 1 deterministic computation: 6-hub exposure ranking
  const topHubs = useMemo(
    () => predictAllAirportFragilities(selectedHour * 60, 90).slice(0, 6),
    [selectedHour]
  );

  // Chapter 2 deterministic computation: BOM 07:30-09:00 or 15:00-16:30 recovery delta
  const rescueEval = useMemo(() => {
    const start = recoveryWindow === "am" ? "07:30" : "15:00";
    const end = recoveryWindow === "am" ? "09:00" : "16:30";
    return evaluateRecoveryCandidates(
      [
        {
          id: `story-bom-${recoveryWindow}`,
          airportId: "BOM",
          startMin: parseHHMM(start),
          endMin: parseHHMM(end),
        },
      ],
      3
    );
  }, [recoveryWindow]);

  const bestRescue = rescueEval.candidates[0];
  const currentMeta = CHAPTER_META[activeChapter];
  const highlightArc = useMemo(() => describeArc(260, 260, 250, 0, 112), []);

  // Code snippet telemetry for dark-slate bottom-right box
  const telemetrySnippet = useMemo(() => {
    if (activeChapter === 0) {
      return {
        cmd: "engine.simulateNetwork([{ airportId: 'BOM', 15:00..16:30 }])",
        out: `delayed: ${vt03Sim.metrics.delayedFlights} | crewBreaches: ${vt03Sim.metrics.crewBreaches} (DS0304) | totalDelay: ${vt03Sim.metrics.totalDelayMinutes}m`,
      };
    }
    if (activeChapter === 1) {
      const lead = topHubs[0];
      return {
        cmd: `predictAllAirportFragilities(${String(selectedHour).padStart(2, "0")}:00 IST, 90m)`,
        out: `topHub: ${lead?.airportId ?? "BOM"} (${lead?.fragilityScore ?? 0}/100) | +30m cliff: ${lead?.extensionBreachProb ?? 0}%`,
      };
    }
    const beforePax = rescueEval.baseline.metrics.totalStrandedPax;
    const afterPax = bestRescue?.result.metrics.totalStrandedPax ?? beforePax;
    return {
      cmd: `evaluateRecoveryCandidates(BOM ${recoveryWindow === "am" ? "07:30–09:00" : "15:00–16:30"})`,
      out: `strandedPax: ${beforePax} -> ${afterPax} | delayDelta: ${bestRescue?.deltas.totalDelayMinutesDelta ?? 0}m | verified: TRUE`,
    };
  }, [
    activeChapter,
    vt03Sim.metrics,
    topHubs,
    selectedHour,
    rescueEval.baseline.metrics.totalStrandedPax,
    bestRescue,
    recoveryWindow,
  ]);

  // Axis helper for VT-DS03 timeline (12:00..23:00 = 720..1380)
  const axisStart = 720;
  const axisSpan = 660;
  const dutyLimitPct = round2(((1290 - axisStart) / axisSpan) * 100); // 21:30 IST = 1290m

  return (
    <section
      aria-label="Core simulator capabilities"
      className="mx-auto max-w-6xl px-4 py-16 lg:grid lg:grid-cols-12 lg:gap-12 lg:px-8"
    >
      {/* Left Column: 3 Tall Editorial Chapters */}
      <div className="space-y-8 lg:col-span-5 lg:space-y-0">
        {CHAPTER_META.map((ch, idx) => {
          const isCurrent = activeChapter === ch.idx;
          const refProp = idx === 0 ? ch0Ref : idx === 1 ? ch1Ref : ch2Ref;

          return (
            <div
              key={ch.code}
              ref={refProp}
              className={`flex flex-col justify-center rounded-xl border p-6 transition-colors duration-200 lg:min-h-[65vh] lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:py-16 ${
                isCurrent
                  ? "border-[#CBD5E1] bg-[#FFFFFF] lg:opacity-100"
                  : "border-[#E6EBF2] bg-[#FFFFFF]/70 lg:opacity-55"
              }`}
            >
              <button
                type="button"
                onClick={() => jumpToChapter(ch.idx)}
                className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB]"
              >
                <span
                  className={`font-mono text-xs font-semibold uppercase tracking-wider ${ch.colorClass}`}
                >
                  {ch.code} · {ch.eyebrow}
                </span>
              </button>

              <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-[#0F172A]">
                {ch.title}
              </h2>

              <p className="mt-3 text-sm leading-relaxed text-[#475569]">
                {ch.description}
              </p>

              <ul className="mt-4 space-y-1.5 font-mono text-xs text-[#334155]">
                {ch.bullets.map((bullet) => (
                  <li key={bullet} className="flex items-center gap-2">
                    <span className={ch.colorClass} aria-hidden="true">
                      →
                    </span>
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-5">
                <Link
                  href={ch.href}
                  className="inline-flex items-center gap-1.5 rounded-md py-1 text-sm font-semibold text-[#1D4ED8] transition-colors duration-150 hover:text-[#1E40AF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB]"
                >
                  <span>{ch.linkLabel}</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      {/* Right Column: Sticky Chronograph Instrument Stage */}
      <div className="mt-10 lg:col-span-7 lg:mt-0">
        <div className="flex flex-col justify-center lg:sticky lg:top-20 lg:h-[calc(100vh-7rem)]">
          {/* Quick Interactive Chapter Switcher */}
          <div
            role="tablist"
            aria-label="Inspect operational stage"
            className="mb-3 flex flex-wrap items-center justify-between gap-2"
          >
            <div className="flex items-center gap-1.5">
              {CHAPTER_META.map((ch) => {
                const selected = activeChapter === ch.idx;
                return (
                  <button
                    key={ch.code}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => jumpToChapter(ch.idx)}
                    className={`cursor-pointer rounded-md border px-2.5 py-1 font-mono text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB] ${
                      selected
                        ? "border-[#1D4ED8] bg-[#EFF6FF] text-[#1D4ED8]"
                        : "border-[#E6EBF2] bg-[#FFFFFF] text-[#475569] hover:text-[#0F172A]"
                    }`}
                  >
                    {ch.code} {ch.title}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Circular Instrument Bezel Card */}
          <div className="relative overflow-hidden rounded-2xl border border-[#E6EBF2] bg-[#FFFFFF] p-6 shadow-sm">
            {/* Subtle Dual Concentric Chronograph Tick Bezel SVG */}
            <svg
              viewBox="0 0 520 520"
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 top-1/2 h-[540px] w-[540px] -translate-x-1/2 -translate-y-1/2 opacity-35"
            >
              <circle
                cx="260"
                cy="260"
                r="250"
                fill="none"
                stroke="#E6EBF2"
                strokeWidth={1.2}
              />
              <circle
                cx="260"
                cy="260"
                r="234"
                fill="none"
                stroke="#E6EBF2"
                strokeWidth={1}
                strokeDasharray="3 6"
              />
              {BEZEL_TICKS.map((t) => (
                <line
                  key={t.idx}
                  x1={t.x1}
                  y1={t.y1}
                  x2={t.x2}
                  y2={t.y2}
                  stroke={t.isMajor ? "#94A3B8" : "#CBD5E1"}
                  strokeWidth={t.isMajor ? 1.5 : 1}
                />
              ))}
              <g
                transform={`rotate(${currentMeta.arcRotation} 260 260)`}
                className="transition-transform duration-300"
              >
                <path
                  d={highlightArc}
                  fill="none"
                  stroke={currentMeta.accentHex}
                  strokeWidth={5}
                  strokeLinecap="round"
                />
              </g>
            </svg>

            {/* Inner Live Interactive Visualization per Active Chapter */}
            <div className="relative z-10 min-h-[300px]">
              {activeChapter === 0 && (
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E6EBF2] pb-3">
                    <span className="font-mono text-xs font-semibold text-[#0F172A]">
                      Tail VT-DS03 · Crew CR03 (600m duty wall @ 21:30 IST)
                    </span>
                    <span className="rounded bg-[#FEE2E2] px-2 py-0.5 font-mono text-[11px] font-semibold text-[#B91C1C]">
                      BOM storm 15:00–16:30
                    </span>
                  </div>

                  <div className="mt-4 space-y-3">
                    {vt03Legs.map((leg) => {
                      const leftPct = round2(
                        Math.max(
                          0,
                          ((leg.actualDepMin - axisStart) / axisSpan) * 100
                        )
                      );
                      const rawWidthPct = round2(
                        ((leg.actualArrMin - leg.actualDepMin) / axisSpan) * 100
                      );
                      const clampedLeft = round2(Math.min(76, leftPct));
                      const clampedWidth = round2(
                        Math.min(100 - clampedLeft, Math.max(22, rawWidthPct))
                      );
                      const isBreach = leg.status === "CREW_BREACH";
                      const isDelayed = leg.status === "DELAYED";

                      return (
                        <div
                          key={leg.flight_id}
                          className="grid grid-cols-12 items-center gap-3 text-xs"
                        >
                          <div className="col-span-4 font-mono">
                            <div className="font-semibold text-[#0F172A]">
                              {leg.flight_id} · {leg.origin}→{leg.destination}
                            </div>
                            <div className="text-[11px] text-[#475569]">
                              Sched {leg.dep}–{leg.arr}
                            </div>
                            <div className="text-[11px] font-medium text-[#334155]">
                              Actual {formatHHMM(leg.actualDepMin)}–
                              {formatHHMM(leg.actualArrMin)}
                            </div>
                          </div>

                          <div className="col-span-8">
                            <div className="relative h-9 overflow-hidden rounded-md border border-[#E6EBF2] bg-[#FBFCFD]">
                              {/* 600m Duty Cutoff Line */}
                              <div
                                className="absolute bottom-0 top-0 z-10 w-0.5 bg-[#DC2626]"
                                style={{ left: `${dutyLimitPct}%` }}
                                title="600m legal crew duty cutoff (21:30 IST)"
                              />
                              <div
                                className={`absolute top-1.5 flex h-6 items-center justify-center rounded px-2 font-mono text-[10px] font-semibold whitespace-nowrap ${
                                  isBreach
                                    ? "border border-[#B91C1C] bg-[#FEE2E2] text-[#B91C1C]"
                                    : isDelayed
                                      ? "border border-[#B45309] bg-[#FEF3C7] text-[#B45309]"
                                      : "border border-[#1D4ED8]/40 bg-[#EFF6FF] text-[#1D4ED8]"
                                }`}
                                style={{
                                  left: `${clampedLeft}%`,
                                  width: `${clampedWidth}%`,
                                }}
                              >
                                <span className="inline-flex items-center gap-1">
                                  {isBreach ? (
                                    <>
                                      <ShieldAlert
                                        className="h-3 w-3 shrink-0"
                                        aria-hidden="true"
                                      />
                                      BREACH
                                    </>
                                  ) : isDelayed ? (
                                    `+${leg.delayMin}m`
                                  ) : (
                                    "ON TIME"
                                  )}
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
                    <span className="font-semibold text-[#B91C1C]">
                      CR03 Duty Cutoff: 21:30 IST (600m)
                    </span>
                    <span>23:00 IST</span>
                  </div>
                </div>
              )}

              {activeChapter === 1 && (
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E6EBF2] pb-3">
                    <div>
                      <span className="font-mono text-xs font-semibold text-[#0F172A]">
                        90m hub closure exposure index (0–100)
                      </span>
                      <div className="text-[11px] text-[#475569]">
                        Downstream cascade sensitivity &amp; +30m crew cliff risk
                      </div>
                    </div>
                    <div
                      role="group"
                      aria-label="Select departure wave hour"
                      className="flex items-center gap-1"
                    >
                      {([8, 12, 16] as const).map((hr) => (
                        <button
                          key={hr}
                          type="button"
                          aria-pressed={selectedHour === hr}
                          onClick={() => setSelectedHour(hr)}
                          className={`cursor-pointer rounded-md border px-2.5 py-1 font-mono text-[11px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB] ${
                            selectedHour === hr
                              ? "border-[#1D4ED8] bg-[#EFF6FF] text-[#1D4ED8]"
                              : "border-[#E6EBF2] bg-[#FBFCFD] text-[#475569] hover:text-[#0F172A]"
                          }`}
                        >
                          {String(hr).padStart(2, "0")}:00
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="mt-4 space-y-3">
                    {topHubs.map((hub) => (
                      <div key={hub.airportId} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-[#0F172A]">
                              {hub.airportId}
                            </span>
                            <span className="text-[#475569]">{hub.city}</span>
                          </div>
                          <div className="flex items-center gap-3 font-mono tabular-nums">
                            <span className="text-[11px] text-[#475569]">
                              +30m cliff: {hub.extensionBreachProb}%
                            </span>
                            <span className="w-8 text-right font-semibold text-[#0F172A]">
                              {hub.fragilityScore}
                            </span>
                          </div>
                        </div>
                        <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#F1F5F9]">
                          <div
                            className={`h-full rounded-full transition-all duration-200 ${
                              hub.fragilityScore >= 65
                                ? "bg-[#DC2626]"
                                : hub.fragilityScore >= 32
                                  ? "bg-[#D97706]"
                                  : "bg-[#2B79FB]"
                            }`}
                            style={{
                              width: `${Math.max(4, hub.fragilityScore)}%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeChapter === 2 && (
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E6EBF2] pb-3">
                    <div>
                      <span className="font-mono text-xs font-semibold text-[#0F172A]">
                        {bestRescue?.title ??
                          "Deploy standby spare aircraft recovery"}
                      </span>
                      <div className="mt-0.5 inline-flex items-center gap-1 rounded border border-[#047857]/25 bg-[#ECFDF5] px-2 py-0.5 font-mono text-[11px] font-semibold text-[#047857]">
                        <CheckCircle2
                          className="h-3 w-3"
                          aria-hidden="true"
                        />
                        Allow-list verified
                      </div>
                    </div>

                    <div
                      role="group"
                      aria-label="Select Mumbai storm window"
                      className="flex items-center gap-1"
                    >
                      <button
                        type="button"
                        aria-pressed={recoveryWindow === "am"}
                        onClick={() => setRecoveryWindow("am")}
                        className={`cursor-pointer rounded-md border px-2 py-1 font-mono text-[11px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB] ${
                          recoveryWindow === "am"
                            ? "border-[#1D4ED8] bg-[#EFF6FF] text-[#1D4ED8]"
                            : "border-[#E6EBF2] bg-[#FBFCFD] text-[#475569] hover:text-[#0F172A]"
                        }`}
                      >
                        07:30–09:00
                      </button>
                      <button
                        type="button"
                        aria-pressed={recoveryWindow === "pm"}
                        onClick={() => setRecoveryWindow("pm")}
                        className={`cursor-pointer rounded-md border px-2 py-1 font-mono text-[11px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB] ${
                          recoveryWindow === "pm"
                            ? "border-[#1D4ED8] bg-[#EFF6FF] text-[#1D4ED8]"
                            : "border-[#E6EBF2] bg-[#FBFCFD] text-[#475569] hover:text-[#0F172A]"
                        }`}
                      >
                        15:00–16:30
                      </button>
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="rounded-lg border border-[#E6EBF2] bg-[#FBFCFD] p-3.5">
                      <div className="text-xs text-[#475569]">Stranded pax</div>
                      <div className="mt-1.5 flex items-baseline gap-2 font-mono text-xl font-bold tabular-nums">
                        <span className="text-[#475569] line-through">
                          {rescueEval.baseline.metrics.totalStrandedPax}
                        </span>
                        <span className="text-[#047857]">
                          {bestRescue?.result.metrics.totalStrandedPax ??
                            rescueEval.baseline.metrics.totalStrandedPax}
                        </span>
                      </div>
                    </div>

                    <div className="rounded-lg border border-[#E6EBF2] bg-[#FBFCFD] p-3.5">
                      <div className="text-xs text-[#475569]">Crew breaches</div>
                      <div className="mt-1.5 flex items-baseline gap-2 font-mono text-xl font-bold tabular-nums">
                        <span className="text-[#475569] line-through">
                          {rescueEval.baseline.metrics.crewBreaches}
                        </span>
                        <span className="text-[#047857]">
                          {bestRescue?.result.metrics.crewBreaches ??
                            rescueEval.baseline.metrics.crewBreaches}
                        </span>
                      </div>
                    </div>

                    <div className="rounded-lg border border-[#E6EBF2] bg-[#FBFCFD] p-3.5">
                      <div className="text-xs text-[#475569]">Delay delta</div>
                      <div className="mt-1.5 font-mono text-xl font-bold tabular-nums text-[#1D4ED8]">
                        {bestRescue?.deltas.totalDelayMinutesDelta ?? 0}m
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-3 border-t border-[#E6EBF2] pt-3 font-mono text-[11px] text-[#047857]">
                    <span className="inline-flex items-center gap-1">
                      <CheckCircle2
                        className="h-3.5 w-3.5"
                        aria-hidden="true"
                      />
                      Flight IDs matched
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <CheckCircle2
                        className="h-3.5 w-3.5"
                        aria-hidden="true"
                      />
                      Tail &amp; crew clocks legal
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <CheckCircle2
                        className="h-3.5 w-3.5"
                        aria-hidden="true"
                      />
                      Zero aircraft teleportation
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Floating Dark-Slate Technical Readout Box + 3-Segment Tick Bar */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[#1E2430] px-4 py-3 font-mono text-[11px] text-[#F8FAFC] shadow-sm">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[#CBD5E1]">
                {telemetrySnippet.cmd}
              </div>
              <div className="mt-0.5 truncate font-semibold text-[#F8FAFC]">
                {telemetrySnippet.out}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              {CHAPTER_META.map((ch) => {
                const isAct = activeChapter === ch.idx;
                const barColor =
                  ch.idx === 0
                    ? "bg-[#D97706]"
                    : ch.idx === 1
                      ? "bg-[#DC2626]"
                      : "bg-[#059669]";
                return (
                  <button
                    key={ch.code}
                    type="button"
                    aria-label={`Jump to chapter ${ch.code}: ${ch.title}`}
                    onClick={() => jumpToChapter(ch.idx)}
                    className={`h-2 cursor-pointer rounded-full transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB] ${
                      isAct ? `w-7 ${barColor}` : "w-3 bg-[#475569]"
                    }`}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
