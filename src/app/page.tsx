"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { HeroFlightCanvas } from "@/components/HeroFlightCanvas";
import { LandingModules } from "@/components/LandingModules";
import { SiteNav } from "@/components/SiteNav";
import { parseHHMM, simulateNetwork } from "@/lib/sim/engine";
import type { AirportClosure } from "@/lib/sim/types";

interface StoryEnv {
  id: string;
  label: string;
  presetId: string;
  clockMin: number;
  summary: string;
  closures: AirportClosure[];
}

const ENVIRONMENTS: StoryEnv[] = [
  {
    id: "bom",
    label: "Mumbai Monsoon",
    presetId: "bom-90m",
    clockMin: parseHHMM("08:15"),
    summary: "90-minute thunderstorm closes BOM 07:30–09:00 IST.",
    closures: [
      {
        id: "hero-bom",
        airportId: "BOM",
        startMin: parseHHMM("07:30"),
        endMin: parseHHMM("09:00"),
      },
    ],
  },
  {
    id: "del",
    label: "Delhi Winter Fog",
    presetId: "bom-del-dual",
    clockMin: parseHHMM("11:35"),
    summary: "Dense morning fog halts northern hub departures at DEL 11:15–12:15 IST.",
    closures: [
      {
        id: "hero-del",
        airportId: "DEL",
        startMin: parseHHMM("11:15"),
        endMin: parseHHMM("12:15"),
      },
    ],
  },
  {
    id: "gau",
    label: "Guwahati Spoke",
    presetId: "gau-spoke",
    clockMin: parseHHMM("17:50"),
    summary: "Isolated evening closure at GAU impacts only Northeast tail chains.",
    closures: [
      {
        id: "hero-gau",
        airportId: "GAU",
        startMin: parseHHMM("17:00"),
        endMin: parseHHMM("19:45"),
      },
    ],
  },
  {
    id: "dual",
    label: "Dual-Hub Crisis",
    presetId: "bom-del-dual",
    clockMin: parseHHMM("11:40"),
    summary: "Chained BOM + DEL closures trigger multi-hop turnaround & connection shockwaves.",
    closures: [
      {
        id: "hero-dual-bom",
        airportId: "BOM",
        startMin: parseHHMM("08:00"),
        endMin: parseHHMM("09:30"),
      },
      {
        id: "hero-dual-del",
        airportId: "DEL",
        startMin: parseHHMM("11:15"),
        endMin: parseHHMM("12:15"),
      },
    ],
  },
];

export default function LandingPage() {
  const [envId, setEnvId] = useState("bom");
  const activeEnv =
    ENVIRONMENTS.find((e) => e.id === envId) ?? ENVIRONMENTS[0];

  const sim = useMemo(
    () => simulateNetwork(activeEnv.closures),
    [activeEnv.closures]
  );

  return (
    <div className="light-grid-bg min-h-screen text-[#0F172A]">
      <SiteNav />

      {/* Above-the-Fold Split Hero */}
      <main className="mx-auto max-w-6xl px-4 pb-12 pt-10 lg:px-8 lg:pt-14">
        <div className="grid items-center gap-10 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <h1 className="font-display text-4xl font-bold tracking-tight text-[#0F172A] sm:text-5xl">
              One storm in Mumbai. Seventy flights across India.
            </h1>
            <p className="mt-4 max-w-prose text-base leading-relaxed text-[#475569]">
              Close any of India&apos;s 16 airports and watch delays cascade across
              chained aircraft, passenger connections, and 600-minute crew duty
              clocks—then recover the network with verified AI dispatch.
            </p>

            {/* Environment Switcher */}
            <div className="mt-6">
              <div className="text-xs font-medium text-[#475569]">
                Preview live disruption environment
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {ENVIRONMENTS.map((env) => {
                  const active = env.id === activeEnv.id;
                  return (
                    <button
                      key={env.id}
                      type="button"
                      onClick={() => setEnvId(env.id)}
                      className={`cursor-pointer rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] ${
                        active
                          ? "border-[#2563EB] bg-[#EFF6FF] text-[#2563EB]"
                          : "border-[#E2E8F0] bg-[#FFFFFF] text-[#475569] hover:border-[#CBD5E1] hover:text-[#0F172A]"
                      }`}
                    >
                      {env.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2.5 text-xs text-[#475569]">
                {activeEnv.summary}
              </p>
            </div>

            {/* Live Computed Deterministic Snapshot */}
            <div className="mt-5 flex flex-wrap items-center gap-6 border-y border-[#E2E8F0] py-3 font-mono tabular-nums">
              <div>
                <div className="text-xl font-bold text-[#B45309]">
                  {sim.metrics.delayedFlights}
                </div>
                <div className="font-sans text-[11px] text-[#475569]">
                  Delayed flights
                </div>
              </div>
              <div>
                <div className="text-xl font-bold text-[#DC2626]">
                  {sim.metrics.totalStrandedPax}
                </div>
                <div className="font-sans text-[11px] text-[#475569]">
                  Stranded pax
                </div>
              </div>
              <div>
                <div className="text-xl font-bold text-[#0F172A]">
                  {sim.metrics.totalDelayMinutes}m
                </div>
                <div className="font-sans text-[11px] text-[#475569]">
                  Total delay
                </div>
              </div>
            </div>

            {/* Primary CTAs */}
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                href={`/simulator?preset=${activeEnv.presetId}&view=simple`}
                className="inline-flex h-10 items-center gap-2 rounded-md bg-[#2563EB] px-4 text-sm font-semibold text-white transition-colors duration-150 hover:bg-[#1D4ED8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
              >
                <span>Open Simple Simulator</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link
                href={`/simulator?preset=${activeEnv.presetId}&view=advanced`}
                className="inline-flex h-10 items-center gap-2 rounded-md border border-[#CBD5E1] bg-[#FFFFFF] px-4 text-sm font-semibold text-[#0F172A] transition-colors duration-150 hover:bg-[#F1F5F9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
              >
                Advanced OCC View
              </Link>
            </div>
          </div>

          <div className="lg:col-span-7">
            <HeroFlightCanvas
              environmentTitle={activeEnv.label}
              simulation={sim}
              clockMin={activeEnv.clockMin}
            />
          </div>
        </div>
      </main>

      <LandingModules />

      <footer className="border-t border-[#E2E8F0] bg-[#FFFFFF] py-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 text-xs text-[#475569] lg:px-8">
          <span className="font-mono">
            Domino Sky · 16 Indian airports · 70 flights · 21 connections · 16
            crews · 2 spares
          </span>
          <div className="flex items-center gap-4 font-medium">
            <Link href="/simulator" className="hover:text-[#0F172A]">
              Simulator
            </Link>
            <Link href="/intelligence" className="hover:text-[#0F172A]">
              Intelligence Lab
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
