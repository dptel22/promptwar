"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Cpu, ShieldCheck } from "lucide-react";
import { SiteNav } from "@/components/SiteNav";
import { MODEL_ARTIFACT } from "@/lib/ml/predict";
import { DATASET, simulateNetwork } from "@/lib/sim/engine";
import { parseCrisisDeterministic } from "@/lib/sim/parse-crisis";
import {
  buildDeterministicBriefing,
  evaluateRecoveryCandidates,
} from "@/lib/sim/recovery";
import { verifyAiBriefing } from "@/lib/sim/verify-ai";

export default function AboutPage() {
  const stressResults = useMemo(() => {
    // 1. Buffer Absorption (20m vs 110m at BOM)
    const bom20 = simulateNetwork([
      { id: "s1a", airportId: "BOM", startMin: 450, endMin: 470 },
    ]);
    const bom110 = simulateNetwork([
      { id: "s1b", airportId: "BOM", startMin: 450, endMin: 560 },
    ]);
    const ds1203 = bom20.flightsById["DS1203"];
    const pass1 =
      ds1203.bufferAbsorbedMin > 0 &&
      ds1203.delayMin === 0 &&
      bom110.metrics.delayedFlights > bom20.metrics.delayedFlights;

    // 2. Spoke Isolation (GAU 17:00–19:45 IST)
    const gau = simulateNetwork([
      { id: "s2", airportId: "GAU", startMin: 1020, endMin: 1185 },
    ]);
    const pass2 =
      gau.metrics.affectedTails.length > 0 &&
      gau.metrics.affectedTails.length <= 2 &&
      gau.metrics.onTimeFlights >= 65;

    // 3. Live Recovery Delta + Undo (BOM 90m)
    const bomEval = evaluateRecoveryCandidates([
      { id: "s3", airportId: "BOM", startMin: 450, endMin: 540 },
    ]);
    const best = bomEval.candidates[0];
    const pass3 =
      Boolean(best) &&
      best.result.metrics.totalStrandedPax <
        bomEval.baseline.metrics.totalStrandedPax;

    // 4. HYD 75m Unscripted Crisis + Verifier
    const parsedHyd = parseCrisisDeterministic(
      "75 minute storm at HYD at 12:00"
    );
    const hydEval = evaluateRecoveryCandidates(parsedHyd.closures);
    const hydVerify = verifyAiBriefing(
      buildDeterministicBriefing(hydEval),
      hydEval
    );
    const pass4 = parsedHyd.closures.length === 1 && hydVerify.valid;

    return {
      s1: {
        shortDelayed: bom20.metrics.delayedFlights,
        shortAbsorbed: ds1203.bufferAbsorbedMin,
        shortDownstreamDelay: ds1203.delayMin,
        longDelayed: bom110.metrics.delayedFlights,
        longStranded: bom110.metrics.totalStrandedPax,
        pass: pass1,
      },
      s2: {
        affectedTails: gau.metrics.affectedTails,
        onTimeFlights: gau.metrics.onTimeFlights,
        pass: pass2,
      },
      s3: {
        beforeStranded: bomEval.baseline.metrics.totalStrandedPax,
        afterStranded: best?.result.metrics.totalStrandedPax ?? 0,
        bestTitle: best?.title ?? "No improving action",
        pass: pass3,
      },
      s4: {
        hydDelayed: hydEval.baseline.metrics.delayedFlights,
        hydStranded: hydEval.baseline.metrics.totalStrandedPax,
        verified: hydVerify.valid,
        pass: pass4,
      },
    };
  }, []);

  const networkStats = [
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

  const physicsAssumptions = [
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

  const pipelineSteps = [
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

  return (
    <div className="light-grid-bg min-h-screen text-[#0F172A]">
      <SiteNav />

      <main className="mx-auto max-w-6xl space-y-14 px-4 py-10 lg:px-8">
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
            {networkStats.map((stat) => (
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
            {physicsAssumptions.map((item) => (
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
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold uppercase tracking-wider text-[#1D4ED8]">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                03 · Zero-Hallucination AI Dispatch Architecture
              </div>
              <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-[#0F172A]">
                Verified natural-language dispatch over strict simulator output
              </h2>
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {pipelineSteps.map((p) => (
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
                  <Cpu className="h-3.5 w-3.5 text-[#1D4ED8]" aria-hidden="true" />
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
        <section className="border-t border-[#E6EBF2] pt-10">
          <div className="font-mono text-xs font-semibold uppercase tracking-wider text-[#1D4ED8]">
            04 · Live Verifiers
          </div>
          <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-[#0F172A]">
            Live 4 Judging Stress-Test Verifiers
          </h2>
          <p className="mt-1 text-xs text-[#475569]">
            Executed live by the deterministic simulation, recovery, parser, and
            regex verification modules right in your browser.
          </p>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <VerifierCard
              code="Stress Test 01"
              title="BOM 20m vs 110m Buffer Absorption"
              passed={stressResults.s1.pass}
              detail={`20m hold: DS1203 absorbs ${stressResults.s1.shortAbsorbed}m slack (${stressResults.s1.shortDownstreamDelay}m downstream delay; ${stressResults.s1.shortDelayed} flights delayed). 110m storm: ${stressResults.s1.longDelayed} flights delayed, ${stressResults.s1.longStranded} pax stranded.`}
              href="/simulator?preset=bom-20m-buffer&view=advanced"
            />
            <VerifierCard
              code="Stress Test 02"
              title="GAU Spoke Isolation (17:00–19:45 IST)"
              passed={stressResults.s2.pass}
              detail={`Only tail ${stressResults.s2.affectedTails.join(", ")} degrades; ${stressResults.s2.onTimeFlights}/70 flights across the rest of India stay on time.`}
              href="/simulator?preset=gau-spoke&view=simple"
            />
            <VerifierCard
              code="Stress Test 03"
              title="Live Recovery Delta + Undo (BOM 90m)"
              passed={stressResults.s3.pass}
              detail={`Recommended action (${stressResults.s3.bestTitle}) drops stranded pax from ${stressResults.s3.beforeStranded} to ${stressResults.s3.afterStranded}.`}
              href="/simulator?preset=bom-90m&view=simple"
            />
            <VerifierCard
              code="Stress Test 04"
              title="HYD 75m Unscripted Crisis + Verifier"
              passed={stressResults.s4.pass}
              detail={`Compiled HYD 12:00–13:15 (${stressResults.s4.hydDelayed} delayed, ${stressResults.s4.hydStranded} stranded). Regex allow-list verifier passed: ${stressResults.s4.verified ? "TRUE" : "FALSE"}.`}
              href="/simulator?preset=hyd-75m&view=simple"
            />
          </div>
        </section>
      </main>
    </div>
  );
}

function VerifierCard({
  code,
  title,
  passed,
  detail,
  href,
}: {
  code: string;
  title: string;
  passed: boolean;
  detail: string;
  href: string;
}) {
  return (
    <div className="flex flex-col justify-between rounded-xl border border-[#E6EBF2] bg-[#FFFFFF] p-5 shadow-xs">
      <div>
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-xs font-semibold text-[#1D4ED8]">
            {code}
          </span>
          <span
            className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-[11px] font-semibold ${
              passed
                ? "border-[#047857]/25 bg-[#ECFDF5] text-[#047857]"
                : "border-[#B91C1C]/25 bg-[#FEE2E2] text-[#B91C1C]"
            }`}
          >
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            {passed ? "VERIFIED PASS" : "CHECK FAILED"}
          </span>
        </div>
        <h3 className="mt-2 text-sm font-semibold text-[#0F172A]">{title}</h3>
        <p className="mt-1.5 text-xs leading-relaxed text-[#475569]">
          {detail}
        </p>
      </div>
      <div className="mt-4 pt-1">
        <Link
          href={href}
          className="inline-flex items-center gap-1 rounded py-0.5 text-xs font-semibold text-[#1D4ED8] hover:text-[#1E40AF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB]"
        >
          <span>Open in Simulator</span>
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
