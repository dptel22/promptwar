/**
 * Live deterministic stress-test runner and verification card grid for the About page.
 */

"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { simulateNetwork } from "@/lib/sim/engine";
import { parseCrisisDeterministic } from "@/lib/sim/parse-crisis";
import {
  buildDeterministicBriefing,
  evaluateRecoveryCandidates,
} from "@/lib/sim/recovery";
import { verifyAiBriefing } from "@/lib/sim/verify-ai";

/** Descriptor for one live deterministic stress-test verification card. */
export interface VerifierCardProps {
  code: string;
  title: string;
  passed: boolean;
  detail: string;
  href: string;
}

function runStressSuite(): VerifierCardProps[] {
  // 1. Buffer Absorption (20m vs 110m at BOM)
  const bom20 = simulateNetwork([
    { id: "s1a", airportId: "BOM", startMin: 450, endMin: 470 },
  ]);
  const bom110 = simulateNetwork([
    { id: "s1b", airportId: "BOM", startMin: 450, endMin: 560 },
  ]);
  const ds1203 = bom20.flightsById["DS1203"];
  const pass1 =
    Boolean(ds1203) &&
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

  return [
    {
      code: "Stress Test 01",
      title: "BOM 20m vs 110m Buffer Absorption",
      passed: pass1,
      detail: `20m hold: DS1203 absorbs ${ds1203?.bufferAbsorbedMin ?? 0}m slack (${ds1203?.delayMin ?? 0}m downstream delay; ${bom20.metrics.delayedFlights} flights delayed). 110m storm: ${bom110.metrics.delayedFlights} flights delayed, ${bom110.metrics.totalStrandedPax} pax stranded.`,
      href: "/simulator?preset=bom-20m-buffer&view=advanced",
    },
    {
      code: "Stress Test 02",
      title: "GAU Spoke Isolation (17:00–19:45 IST)",
      passed: pass2,
      detail: `Only tail ${gau.metrics.affectedTails.join(", ")} degrades; ${gau.metrics.onTimeFlights}/70 flights across the rest of India stay on time.`,
      href: "/simulator?preset=gau-spoke&view=simple",
    },
    {
      code: "Stress Test 03",
      title: "Live Recovery Delta + Undo (BOM 90m)",
      passed: pass3,
      detail: `Recommended action (${best?.title ?? "No improving action"}) drops stranded pax from ${bomEval.baseline.metrics.totalStrandedPax} to ${best?.result.metrics.totalStrandedPax ?? 0}.`,
      href: "/simulator?preset=bom-90m&view=simple",
    },
    {
      code: "Stress Test 04",
      title: "HYD 75m Unscripted Crisis + Verifier",
      passed: pass4,
      detail: `Compiled HYD 12:00–13:15 (${hydEval.baseline.metrics.delayedFlights} delayed, ${hydEval.baseline.metrics.totalStrandedPax} stranded). Regex allow-list verifier passed: ${hydVerify.valid ? "TRUE" : "FALSE"}.`,
      href: "/simulator?preset=hyd-75m&view=simple",
    },
  ];
}

function VerifierCard({ code, title, passed, detail, href }: VerifierCardProps) {
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
        <p className="mt-1.5 text-xs leading-relaxed text-[#475569]">{detail}</p>
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

/**
 * Executes all 4 operational stress scenarios in-browser and displays pass/fail cards.
 */
export function StressVerifiers() {
  const cards = useMemo(() => runStressSuite(), []);

  return (
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
        {cards.map((card) => (
          <VerifierCard key={card.code} {...card} />
        ))}
      </div>
    </section>
  );
}
