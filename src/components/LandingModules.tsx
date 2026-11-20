"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, ShieldAlert } from "lucide-react";
import { MODEL_ARTIFACT, predictAllAirportFragilities } from "@/lib/ml/predict";
import { formatHHMM, parseHHMM, simulateNetwork } from "@/lib/sim/engine";
import { evaluateRecoveryCandidates } from "@/lib/sim/recovery";

function useScrollProgress(ref: React.RefObject<HTMLElement | null>) {
  const [progress, setProgress] = useState(1);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setProgress(1);
      return;
    }

    const update = () => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight || 800;
      const raw = (vh * 0.85 - rect.top) / (vh * 0.55);
      setProgress(Math.max(0.15, Math.min(1, raw)));
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update, { passive: true });
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [ref]);

  return progress;
}

export function LandingModules() {
  const mod1Ref = useRef<HTMLElement>(null);
  const mod2Ref = useRef<HTMLElement>(null);
  const mod3Ref = useRef<HTMLElement>(null);

  const p1 = useScrollProgress(mod1Ref);
  const p2 = useScrollProgress(mod2Ref);
  const p3 = useScrollProgress(mod3Ref);

  const [selectedHour, setSelectedHour] = useState(8);

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

  const topHubs = useMemo(
    () => predictAllAirportFragilities(selectedHour * 60, 90).slice(0, 6),
    [selectedHour]
  );

  const rescueEval = useMemo(
    () =>
      evaluateRecoveryCandidates(
        [
          {
            id: "story-bom-pm",
            airportId: "BOM",
            startMin: parseHHMM("15:00"),
            endMin: parseHHMM("16:30"),
          },
        ],
        3
      ),
    []
  );

  const bestRescue = rescueEval.candidates[0];

  return (
    <div className="mx-auto max-w-6xl space-y-24 px-4 py-20 lg:px-8">
      {/* Module 01: Tail-Chain Cascade & Crew Legality */}
      <section
        ref={mod1Ref}
        className="grid items-center gap-10 border-t border-[#E2E8F0] pt-14 lg:grid-cols-12"
      >
        <div className="lg:col-span-5">
          <span className="font-mono text-xs font-semibold text-[#2563EB]">
            01 · Deterministic tail chains
          </span>
          <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-[#0F172A]">
            One held turnaround pushes an entire aircraft chain into a crew cutoff.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-[#475569]">
            Every aircraft flies 4–5 chained legs with a strict 30-minute minimum
            turnaround. When Mumbai closes from 15:00 to 16:30 IST, tail{" "}
            <span className="font-mono font-semibold text-[#0F172A]">VT-DS03</span>{" "}
            absorbs zero buffer on tight 35-minute turns and pushes{" "}
            <span className="font-mono font-semibold text-[#0F172A]">DS0304</span>{" "}
            (Delhi → Kolkata) past crew CR03&apos;s 600-minute legal limit.
          </p>
          <Link
            href="/simulator?preset=bom-pm-crew&view=advanced"
            className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-[#2563EB] hover:text-[#1D4ED8]"
          >
            Inspect VT-DS03 in simulator
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

        <div className="rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] p-5 shadow-sm lg:col-span-7">
          <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
            <span className="font-mono text-xs font-semibold text-[#0F172A]">
              Tail VT-DS03 · Crew CR03 (600m duty wall at 21:30 IST)
            </span>
            <span className="font-mono text-xs text-[#DC2626]">
              BOM storm 15:00–16:30
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {vt03Legs.map((leg, idx) => {
              const stepReveal = Math.max(
                0.25,
                Math.min(1, (p1 - idx * 0.14) / 0.45)
              );
              const shiftPx =
                leg.status === "ON_TIME" ? 0 : Math.round(stepReveal * 42);
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
                  </div>

                  <div className="col-span-8">
                    <div className="relative h-8 overflow-hidden rounded-md border border-[#E2E8F0] bg-[#F8FAFC] px-2">
                      {/* Duty Limit Wall */}
                      <div
                        className="absolute bottom-0 right-10 top-0 w-0.5 bg-[#DC2626]"
                        title="600m legal crew duty cutoff"
                      />
                      <div
                        className={`mt-1 flex h-6 items-center justify-between rounded px-2 font-mono text-[11px] font-semibold transition-transform duration-150 ${
                          isBreach
                            ? "border border-[#DC2626] bg-[#FEE2E2] text-[#DC2626]"
                            : isDelayed
                              ? "border border-[#D97706] bg-[#FEF3C7] text-[#B45309]"
                              : "border border-[#2563EB]/40 bg-[#EFF6FF] text-[#2563EB]"
                        }`}
                        style={{
                          width: "66%",
                          transform: `translateX(${shiftPx}px)`,
                        }}
                      >
                        <span>
                          {formatHHMM(leg.actualDepMin)}–
                          {formatHHMM(leg.actualArrMin)}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          {isBreach ? (
                            <>
                              <ShieldAlert className="h-3 w-3" aria-hidden="true" />
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
        </div>
      </section>

      {/* Module 02: Surrogate ML Hub Fragility */}
      <section
        ref={mod2Ref}
        className="grid items-center gap-10 border-t border-[#E2E8F0] pt-14 lg:grid-cols-12"
      >
        <div className="order-2 rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] p-5 shadow-sm lg:order-1 lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0] pb-3">
            <div>
              <span className="font-mono text-xs font-semibold text-[#0F172A]">
                Pre-storm 90m fragility index (0–100)
              </span>
              <span className="ml-2 font-mono text-[11px] text-[#475569]">
                Trained on {MODEL_ARTIFACT.trainedOnSamples.toLocaleString()} sims ·
                ROC-AUC {MODEL_ARTIFACT.logistic.auc}
              </span>
            </div>
            <div className="flex items-center gap-1">
              {[8, 12, 16].map((hr) => (
                <button
                  key={hr}
                  type="button"
                  onClick={() => setSelectedHour(hr)}
                  className={`cursor-pointer rounded-md border px-2 py-1 font-mono text-[11px] font-medium transition-colors duration-150 ${
                    selectedHour === hr
                      ? "border-[#2563EB] bg-[#EFF6FF] text-[#2563EB]"
                      : "border-[#E2E8F0] bg-[#F8FAFC] text-[#475569] hover:text-[#0F172A]"
                  }`}
                >
                  {String(hr).padStart(2, "0")}:00
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {topHubs.map((hub) => {
              const barPct = Math.round(hub.fragilityScore * p2);
              return (
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
                            : "bg-[#2563EB]"
                      }`}
                      style={{ width: `${Math.max(4, barPct)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="order-1 lg:order-2 lg:col-span-5">
          <span className="font-mono text-xs font-semibold text-[#2563EB]">
            02 · Surrogate ML risk layer
          </span>
          <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-[#0F172A]">
            Know which Indian hub will fracture before a cloud appears.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-[#475569]">
            Trained offline across 3,000 runs of our deterministic simulator, a
            sub-millisecond Ridge & Logistic surrogate scores every airport&apos;s
            cascade fragility and predicts whether a +30-minute storm extension will
            trip a crew duty cliff. All delay and passenger counts stay strictly
            deterministic.
          </p>
          <Link
            href="/intelligence"
            className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-[#2563EB] hover:text-[#1D4ED8]"
          >
            Explore all 16 airports & stress tests
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </section>

      {/* Module 03: Zero-Hallucination AI Dispatch */}
      <section
        ref={mod3Ref}
        className="grid items-center gap-10 border-t border-[#E2E8F0] pt-14 lg:grid-cols-12"
      >
        <div className="lg:col-span-5">
          <span className="font-mono text-xs font-semibold text-[#2563EB]">
            03 · Zero-hallucination recovery
          </span>
          <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-[#0F172A]">
            Verified countermeasures with exact before-and-after arithmetic.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-[#475569]">
            Our dispatcher enumerates physically legal spare swaps (VT-DS17 at
            Bengaluru, VT-DS18 at Delhi), round-trip cancellations, and hub
            connection holds—then runs a regex allow-list verifier over every AI
            token so no number or flight ID can ever be invented.
          </p>
          <Link
            href="/simulator?preset=bom-90m"
            className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-[#2563EB] hover:text-[#1D4ED8]"
          >
            Run live recovery preview
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

        <div className="rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] p-5 shadow-sm lg:col-span-7">
          <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
            <span className="font-mono text-xs font-semibold text-[#0F172A]">
              {bestRescue?.title ?? "Deploy spare VT-DS18 on DS0304"}
            </span>
            <span className="inline-flex items-center gap-1 rounded-sm border border-[#059669]/30 bg-[#ECFDF5] px-2 py-0.5 font-mono text-[11px] font-semibold text-[#059669]">
              <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
              Allow-list verified
            </span>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-4">
            <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3">
              <div className="text-xs text-[#475569]">Stranded pax</div>
              <div className="mt-1 flex items-baseline gap-2 font-mono text-xl font-bold tabular-nums">
                <span className="text-[#94A3B8] line-through">
                  {rescueEval.baseline.metrics.totalStrandedPax}
                </span>
                <span className="text-[#059669]">
                  {Math.round(
                    rescueEval.baseline.metrics.totalStrandedPax -
                      (rescueEval.baseline.metrics.totalStrandedPax -
                        (bestRescue?.result.metrics.totalStrandedPax ?? 0)) *
                        p3
                  )}
                </span>
              </div>
            </div>

            <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3">
              <div className="text-xs text-[#475569]">Crew breaches</div>
              <div className="mt-1 flex items-baseline gap-2 font-mono text-xl font-bold tabular-nums">
                <span className="text-[#94A3B8] line-through">
                  {rescueEval.baseline.metrics.crewBreaches}
                </span>
                <span className="text-[#059669]">
                  {bestRescue?.result.metrics.crewBreaches ?? 0}
                </span>
              </div>
            </div>

            <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3">
              <div className="text-xs text-[#475569]">Delay reduction</div>
              <div className="mt-1 font-mono text-xl font-bold tabular-nums text-[#2563EB]">
                {bestRescue?.deltas.totalDelayMinutesDelta ?? 0}m
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-3 border-t border-[#E2E8F0] pt-3 font-mono text-[11px] text-[#475569]">
            <span className="inline-flex items-center gap-1 text-[#059669]">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              Flight IDs matched
            </span>
            <span className="inline-flex items-center gap-1 text-[#059669]">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              Tail & crew clocks legal
            </span>
            <span className="inline-flex items-center gap-1 text-[#059669]">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              Zero aircraft teleportation
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
