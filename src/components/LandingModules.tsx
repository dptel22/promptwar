/**
 * Act 3 sticky chronograph storytelling stage pairing 3 editorial chapters
 * with live deterministic simulator, ML fragility, and recovery visuals.
 */

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { describeArc, polarToCartesian, round2 } from "@/lib/geo";
import { predictAllAirportFragilities } from "@/lib/ml/predict";
import { parseHHMM } from "@/lib/sim/constants";
import { simulateNetwork } from "@/lib/sim/engine";
import { evaluateRecoveryCandidates } from "@/lib/sim/recovery";
import { HubExposureStage, RecoveryStage, TailCascadeStage } from "./landing/ModuleStageViews";

const BEZEL_TICKS = Array.from({ length: 72 }, (_, idx) => {
  const deg = idx * 5;
  const isMajor = idx % 6 === 0;
  const p1 = polarToCartesian(260, 260, isMajor ? 242 : 247, deg);
  const p2 = polarToCartesian(260, 260, 254, deg);
  return { idx, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, isMajor };
});

const HIGHLIGHT_ARC = describeArc(260, 260, 250, 0, 112);

const CHAPTER_META = [
  {
    idx: 0 as const, code: "01", eyebrow: "Tail-chain dominoes", colorClass: "text-[#B45309]", accentHex: "#D97706", barClass: "bg-[#D97706]",
    title: "Tail-chain dominoes",
    description: "Every aircraft flies 4–5 chained legs with a strict 30-minute minimum turnaround. Slack buffers absorb small holds, but a 90-minute storm at Mumbai cascades leg-by-leg down the chain.",
    bullets: ["16 chained aircraft tails", "Explicit buffer absorption", "Fixed-point cascade convergence"],
    href: "/simulator?preset=bom-pm-crew&view=advanced", linkLabel: "Inspect VT-DS03 in simulator",
  },
  {
    idx: 1 as const, code: "02", eyebrow: "Crew & spoke cliffs", colorClass: "text-[#B91C1C]", accentHex: "#DC2626", barClass: "bg-[#DC2626]",
    title: "600m crew & spoke cliffs",
    description: "Delayed turnarounds collide with hard 600-minute legal crew duty walls (such as CR03 on DS0304), while true spoke closures like Guwahati stay isolated to Northeast chains.",
    bullets: ["Legal 600-min duty cutoffs", "True hub vs spoke isolation", "Inclusion-exclusion pax math"],
    href: "/simulator?preset=gau-spoke", linkLabel: "Simulate GAU spoke isolation",
  },
  {
    idx: 2 as const, code: "03", eyebrow: "Verified countermeasures", colorClass: "text-[#047857]", accentHex: "#059669", barClass: "bg-[#059669]",
    title: "Zero-hallucination recovery",
    description: "Physically legal spare swaps (VT-DS17 at BLR, VT-DS18 at DEL), round-trip cancellations, and 45-minute connection holds are simulated deterministically and checked by a regex token allow-list.",
    bullets: ["Live before/after ghost arcs", "Regex token verification", "Instant apply & full undo"],
    href: "/simulator?preset=bom-90m", linkLabel: "Run live recovery preview",
  },
] as const;

/**
 * Renders the three-chapter interactive chronograph showcase for Domino Sky.
 */
export function LandingModules() {
  const [activeChapter, setActiveChapter] = useState<0 | 1 | 2>(0);
  const [sectionProgress, setSectionProgress] = useState(0);
  const [selectedHour, setSelectedHour] = useState<8 | 12 | 16>(8);
  const [recoveryWindow, setRecoveryWindow] = useState<"am" | "pm">("am");

  const sectionRef = useRef<HTMLElement>(null);
  const ch0Ref = useRef<HTMLDivElement>(null);
  const ch1Ref = useRef<HTMLDivElement>(null);
  const ch2Ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let rafId = 0;

    const update = () => {
      const el = sectionRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight || 800;
      const raw = (vh * 0.35 - rect.top) / Math.max(1, el.offsetHeight - vh * 0.65);
      const clamped = Math.round(Math.max(0, Math.min(1, raw)) * 1000) / 1000;
      setSectionProgress(clamped);
      setActiveChapter(clamped < 0.34 ? 0 : clamped < 0.68 ? 1 : 2);
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

  function jumpToChapter(idx: 0 | 1 | 2) {
    setActiveChapter(idx);
    const target = [ch0Ref.current, ch1Ref.current, ch2Ref.current][idx];
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const vt03Sim = useMemo(() => simulateNetwork([{ id: "story-bom-pm", airportId: "BOM", startMin: parseHHMM("15:00"), endMin: parseHHMM("16:30") }]), []);
  const vt03Legs = useMemo(() => vt03Sim.flights.filter((f) => f.tail_id === "VT-DS03").sort((a, b) => a.leg_order - b.leg_order), [vt03Sim]);
  const topHubs = useMemo(() => predictAllAirportFragilities(selectedHour * 60, 90).slice(0, 6), [selectedHour]);
  const rescueEval = useMemo(() => {
    const start = recoveryWindow === "am" ? "07:30" : "15:00";
    const end = recoveryWindow === "am" ? "09:00" : "16:30";
    return evaluateRecoveryCandidates([{ id: `story-bom-${recoveryWindow}`, airportId: "BOM", startMin: parseHHMM(start), endMin: parseHHMM(end) }], 3);
  }, [recoveryWindow]);

  const bestRescue = rescueEval.candidates[0];
  const currentMeta = CHAPTER_META[activeChapter];
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
  }, [activeChapter, vt03Sim.metrics, topHubs, selectedHour, rescueEval.baseline.metrics.totalStrandedPax, bestRescue, recoveryWindow]);

  const chapterProgress =
    activeChapter === 0
      ? Math.max(0.12, Math.min(1, sectionProgress / 0.28))
      : activeChapter === 1
        ? Math.max(0.12, Math.min(1, (sectionProgress - 0.34) / 0.28))
        : Math.max(0.12, Math.min(1, (sectionProgress - 0.68) / 0.26));
  const bezelScrollDeg = round2(sectionProgress * 360);

  return (
    <section ref={sectionRef} aria-label="Core simulator capabilities" className="mx-auto max-w-6xl px-4 py-12 lg:grid lg:grid-cols-12 lg:gap-12 lg:px-8">
      <div className="space-y-8 lg:col-span-5 lg:space-y-10">
        {CHAPTER_META.map((ch, idx) => (
          <div
            key={ch.code}
            ref={idx === 0 ? ch0Ref : idx === 1 ? ch1Ref : ch2Ref}
            className={`flex flex-col justify-center rounded-xl border p-6 transition-colors duration-200 lg:min-h-[42vh] lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:py-8 ${
              activeChapter === ch.idx ? "border-[#CBD5E1] bg-[#FFFFFF] lg:opacity-100" : "border-[#E6EBF2] bg-[#FFFFFF]/70 lg:opacity-55"
            }`}
          >
            <button type="button" onClick={() => jumpToChapter(ch.idx)} className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB]">
              <span className={`font-mono text-xs font-semibold uppercase tracking-wider ${ch.colorClass}`}>{ch.code} · {ch.eyebrow}</span>
            </button>
            <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-[#0F172A]">{ch.title}</h2>
            <p className="mt-3 text-sm leading-relaxed text-[#475569]">{ch.description}</p>
            <ul className="mt-4 space-y-1.5 font-mono text-xs text-[#334155]">
              {ch.bullets.map((bullet) => <li key={bullet} className="flex items-center gap-2"><span className={ch.colorClass} aria-hidden="true">→</span><span>{bullet}</span></li>)}
            </ul>
            <div className="mt-5">
              <Link href={ch.href} className="inline-flex items-center gap-1.5 rounded-md py-1 text-sm font-semibold text-[#1D4ED8] transition-colors duration-150 hover:text-[#1E40AF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB]">
                <span>{ch.linkLabel}</span><ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 lg:col-span-7 lg:mt-0">
        <div className="lg:sticky lg:top-20 lg:py-4">
          <div role="tablist" aria-label="Inspect operational stage" className="mb-3 flex flex-wrap items-center gap-1.5">
            {CHAPTER_META.map((ch) => (
              <button
                key={ch.code}
                type="button"
                role="tab"
                aria-selected={activeChapter === ch.idx}
                onClick={() => jumpToChapter(ch.idx)}
                className={`cursor-pointer rounded-md border px-2.5 py-1 font-mono text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB] ${
                  activeChapter === ch.idx ? "border-[#1D4ED8] bg-[#EFF6FF] text-[#1D4ED8]" : "border-[#E6EBF2] bg-[#FFFFFF] text-[#475569] hover:text-[#0F172A]"
                }`}
              >
                {ch.code} {ch.title}
              </button>
            ))}
          </div>

          <div className="relative overflow-hidden rounded-2xl border border-[#E6EBF2] bg-[#FFFFFF] p-6 shadow-sm">
            <svg viewBox="0 0 520 520" aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 h-[540px] w-[540px] -translate-x-1/2 -translate-y-1/2 opacity-35">
              <circle cx="260" cy="260" r="250" fill="none" stroke="#E6EBF2" strokeWidth={1.2} />
              <circle cx="260" cy="260" r="234" fill="none" stroke="#E6EBF2" strokeWidth={1} strokeDasharray="3 6" />
              <g transform={`rotate(${bezelScrollDeg} 260 260)`}>
                {BEZEL_TICKS.map((t) => <line key={t.idx} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke={t.isMajor ? "#94A3B8" : "#CBD5E1"} strokeWidth={t.isMajor ? 1.5 : 1} />)}
                <path d={HIGHLIGHT_ARC} fill="none" stroke={currentMeta.accentHex} strokeWidth={5} strokeLinecap="round" />
              </g>
            </svg>

            <div className="relative z-10 min-h-[300px]">
              {activeChapter === 0 && <TailCascadeStage legs={vt03Legs} chapterProgress={chapterProgress} />}
              {activeChapter === 1 && <HubExposureStage topHubs={topHubs} selectedHour={selectedHour} onSelectHour={setSelectedHour} chapterProgress={chapterProgress} reducedMotion={false} />}
              {activeChapter === 2 && <RecoveryStage rescueEval={rescueEval} recoveryWindow={recoveryWindow} onSelectWindow={setRecoveryWindow} chapterProgress={chapterProgress} />}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[#1E2430] px-4 py-3 font-mono text-[11px] text-[#F8FAFC] shadow-sm">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[#CBD5E1]">{telemetrySnippet.cmd}</div>
              <div className="mt-0.5 truncate font-semibold text-[#F8FAFC]">{telemetrySnippet.out}</div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {CHAPTER_META.map((ch) => (
                <button
                  key={ch.code}
                  type="button"
                  aria-label={`Jump to chapter ${ch.code}: ${ch.title}`}
                  onClick={() => jumpToChapter(ch.idx)}
                  className={`h-2 cursor-pointer rounded-full transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB] ${
                    activeChapter === ch.idx ? `w-7 ${ch.barClass}` : "w-3 bg-[#475569]"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
