/**
 * About page documenting network scope, deterministic physics assumptions,
 * zero-hallucination AI dispatch architecture, and live stress verifiers.
 */

"use client";

import { Cpu, ShieldCheck } from "lucide-react";
import { SiteNav } from "@/components/SiteNav";
import { StressVerifiers } from "@/components/about/StressVerifiers";
import { MODEL_ARTIFACT } from "@/lib/ml/predict";
import { DATASET } from "@/lib/sim/constants";

const NETWORK_STATS = [
  {
    value: `${DATASET.airports.length} Indian Airports`,
    detail: "4 mega hubs · 4 regional hubs · 8 spoke cities",
  },
  {
    value: `${DATASET.flights.length} Single-Day Flights`,
    detail: "05:30–22:30 IST schedule across 16 aircraft tails",
  },
  {
    value: `${DATASET.connections.length} Passenger Connections`,
    detail: "40–45m minimum hub connection windows tracked live",
  },
  {
    value: `${DATASET.crews.length} Crews · ${DATASET.spare_aircraft.length} Reserve Spares`,
    detail: "VT-DS17 @ BLR and VT-DS18 @ DEL standby bases",
  },
];

const PHYSICS_ASSUMPTIONS = [
  {
    title: "Turnaround-before-closure fixed-point propagation",
    body: `Each tail flies legs in strict order with min_turnaround_minutes = ${DATASET.meta.min_turnaround_minutes}. Inbound delays absorb available slack before pushing downstream departures, evaluated prior to closure checks so late flights cannot depart or arrive into closed hubs. Cross-tail connection holds stabilize in up to 5 fixed-point passes.`,
  },
  {
    title: "ATC holding orbits vs Ground Delay Programs (GDP)",
    body: "Flights already airborne when a destination closes enter an ATC holding orbit (holdingStartMin to holdingEndMin) until reopening. Flights still on the ground at origin wait under a Ground Delay Program until arrClosure.endMin - block_minutes.",
  },
  {
    title: "600-minute legal crew duty cutoff",
    body: "Every crew runs from duty_start up to 600 minutes. If actual arrival exceeds duty_start + 600m, the leg is flagged CREW_BREACH and grounds both that leg and downstream legs assigned to that crew.",
  },
  {
    title: "Inclusion-exclusion passenger accounting",
    body: "Stranded totals never double-count passengers connecting between two grounded flights: totalStrandedPax = groundedPax - dualGroundedOverlapPax + missedConnectionPax.",
  },
  {
    title: "Zero aircraft teleportation & reserve briefing",
    body: "Spares deploy strictly from their physical base (VT-DS17 at BLR, VT-DS18 at DEL) onto flights departing that exact airport. Reserve crews begin a fresh 600-minute duty clock at takeoverDep - 30m briefing. Cancellations are restricted to crew-breached final legs or matched A->B / B->A round-trip spoke pairs.",
  },
];

const PIPELINE_STEPS = [
  {
    step: "01",
    title: "Deterministic counterfactual ranking",
    body: "evaluateRecoveryCandidates enumerates all legal spare swaps, round-trip cancellations, <=45m connection holds, and compatible 2-action combos—running the full physics engine on each candidate.",
  },
  {
    step: "02",
    title: "Structured AI SDK v7 synthesis",
    body: "POST /api/dispatch calls generateText with Output.object (Zod schema) using grounded simulation JSON so the LLM receives exact candidate IDs, deltas, and flight/connection tokens.",
  },
  {
    step: "03",
    title: "Regex allow-list verification",
    body: "verifyAiBriefing scans every output string for DSxxxx, VT-DSxx, CXxx, CRxx, and standalone integers. Any ungrounded token immediately rejects the LLM output.",
  },
  {
    step: "04",
    title: "Deterministic fallback",
    body: "Whenever an API key is unavailable or verification detects a single mismatched token, buildDeterministicBriefing supplies an instant, 100% engine-derived briefing.",
  },
];

/**
 * Renders the Domino Sky methodology, safety invariants, and live verifier suite.
 */
export default function AboutPage() {
  return (
    <div className="light-grid-bg min-h-screen text-[#0F172A]">
      <SiteNav />

      <main
        id="main-content"
        className="mx-auto max-w-6xl space-y-14 px-4 py-10 lg:px-8"
      >
        {/* Section 1: About Domino Sky & Network Scope */}
        <section>
          <div className="max-w-3xl">
            <div className="font-mono text-xs font-semibold uppercase tracking-wider text-[#1D4ED8]">
              01 · Network Scope &amp; Design
            </div>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-[#0F172A] sm:text-4xl">
              Deterministic Indian OCC simulation, verified end-to-end.
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-[#475569]">
              Domino Sky models a complete single-day Indian domestic aviation
              schedule in IST (UTC+05:30). Every delay minute, turnaround slack
              absorption, holding orbit, crew cutoff, and stranded passenger
              count is computed deterministically in the browser.
            </p>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {NETWORK_STATS.map((stat) => (
              <div
                key={stat.value}
                className="rounded-xl border border-[#E6EBF2] bg-[#FFFFFF] p-4 shadow-xs"
              >
                <div className="font-mono text-sm font-bold text-[#0F172A]">
                  {stat.value}
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-[#475569]">
                  {stat.detail}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Section 2: Deterministic Physics & Explicit Assumptions */}
        <section className="border-t border-[#E6EBF2] pt-10">
          <div className="font-mono text-xs font-semibold uppercase tracking-wider text-[#1D4ED8]">
            02 · Deterministic Physics &amp; Explicit Assumptions
          </div>
          <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-[#0F172A]">
            Physical rules governing every tail, crew, and connection
          </h2>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {PHYSICS_ASSUMPTIONS.map((item) => (
              <div
                key={item.title}
                className="rounded-xl border border-[#E6EBF2] bg-[#FFFFFF] p-5 shadow-xs"
              >
                <h3 className="text-sm font-semibold text-[#0F172A]">
                  {item.title}
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-[#475569]">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Section 3: Zero-Hallucination AI Dispatch Architecture */}
        <section className="border-t border-[#E6EBF2] pt-10">
          <div className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold uppercase tracking-wider text-[#1D4ED8]">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            03 · Zero-Hallucination AI Dispatch Architecture
          </div>
          <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-[#0F172A]">
            Verified natural-language dispatch over strict simulator output
          </h2>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PIPELINE_STEPS.map((p) => (
              <div
                key={p.step}
                className="rounded-xl border border-[#E6EBF2] bg-[#FFFFFF] p-4 shadow-xs"
              >
                <div className="font-mono text-xs font-bold text-[#1D4ED8]">
                  Step {p.step}
                </div>
                <h3 className="mt-1.5 text-sm font-semibold text-[#0F172A]">
                  {p.title}
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-[#475569]">
                  {p.body}
                </p>
              </div>
            ))}
          </div>

          {/* Transparent Surrogate Fragility Note */}
          <div className="mt-6 rounded-xl border border-[#E6EBF2] bg-[#FFFFFF] p-5 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="max-w-2xl">
                <div className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-[#0F172A]">
                  <Cpu
                    className="h-3.5 w-3.5 text-[#1D4ED8]"
                    aria-hidden="true"
                  />
                  Optional Pre-Storm Surrogate Fragility Scoring
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-[#475569]">
                  For rapid pre-storm airport triage, an offline Ridge &amp;
                  Logistic surrogate trained on{" "}
                  <span className="font-mono font-semibold text-[#0F172A]">
                    {MODEL_ARTIFACT.trainedOnSamples.toLocaleString()}
                  </span>{" "}
                  deterministic simulator runs scores airport fragility (0–100)
                  and +30m extension crew-breach risk in under 1ms. All
                  operational delay, connection, and passenger metrics remain
                  strictly deterministic.
                </p>
              </div>

              <div className="flex flex-wrap gap-5 rounded-lg border border-[#E6EBF2] bg-[#FBFCFD] px-4 py-2.5 font-mono tabular-nums">
                <div>
                  <div className="text-sm font-bold text-[#1D4ED8]">
                    {MODEL_ARTIFACT.ridge.r2}
                  </div>
                  <div className="font-sans text-[11px] text-[#475569]">
                    Held-out R²
                  </div>
                </div>
                <div>
                  <div className="text-sm font-bold text-[#047857]">
                    {MODEL_ARTIFACT.logistic.auc}
                  </div>
                  <div className="font-sans text-[11px] text-[#475569]">
                    Cliff ROC-AUC
                  </div>
                </div>
                <div>
                  <div className="text-sm font-bold text-[#0F172A]">
                    {Math.round(MODEL_ARTIFACT.logistic.accuracy * 100)}%
                  </div>
                  <div className="font-sans text-[11px] text-[#475569]">
                    Test accuracy
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section 4: Live 4 Judging Stress-Test Verifiers */}
        <StressVerifiers />
      </main>
    </div>
  );
}
