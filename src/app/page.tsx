/**
 * Domino Sky landing story page orchestrating the live hero chronograph dial,
 * scroll-scrubbed 6-layer architecture blueprint, and operational chapters.
 */

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AnimeHeroDial } from "@/components/AnimeHeroDial";
import { ExplodedBlueprint } from "@/components/ExplodedBlueprint";
import { LandingModules } from "@/components/LandingModules";
import { SiteNav } from "@/components/SiteNav";
import { parseHHMM } from "@/lib/sim/constants";
import { simulateNetwork } from "@/lib/sim/engine";
import type { AirportClosure } from "@/lib/sim/types";

interface StoryEnv {
  id: string;
  label: string;
  simulatorHref: string;
  clockMin: number;
  summary: string;
  closures: AirportClosure[];
}

const ENVIRONMENTS: StoryEnv[] = [
  {
    id: "bom-90m",
    label: "Mumbai Monsoon",
    simulatorHref: "/simulator?preset=bom-90m&view=simple",
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
    id: "del-60m-fog",
    label: "Delhi Winter Fog",
    simulatorHref: "/simulator?preset=del-60m-fog&view=simple",
    clockMin: parseHHMM("11:35"),
    summary:
      "Dense visibility drop halts northern hub departures at DEL 11:15–12:15 IST.",
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
    id: "gau-spoke",
    label: "Guwahati Spoke",
    simulatorHref: "/simulator?preset=gau-spoke&view=simple",
    clockMin: parseHHMM("17:50"),
    summary:
      "Isolated evening closure at GAU 17:00–19:45 IST impacts only Northeast tail chains.",
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
    id: "bom-del-dual",
    label: "Dual-Hub Crisis",
    simulatorHref: "/simulator?preset=bom-del-dual&view=simple",
    clockMin: parseHHMM("08:35"),
    summary:
      "Chained BOM (07:30–09:00) + DEL (15:00–16:30) closures trigger multi-hop turnaround & connection shockwaves.",
    closures: [
      {
        id: "hero-dual-bom",
        airportId: "BOM",
        startMin: parseHHMM("07:30"),
        endMin: parseHHMM("09:00"),
      },
      {
        id: "hero-dual-del",
        airportId: "DEL",
        startMin: parseHHMM("15:00"),
        endMin: parseHHMM("16:30"),
      },
    ],
  },
];

/**
 * Renders the three-act Domino Sky interactive story landing page.
 */
export default function LandingPage() {
  const [envId, setEnvId] = useState("bom-90m");
  const activeEnv =
    ENVIRONMENTS.find((e) => e.id === envId) ?? ENVIRONMENTS[0];

  const sim = useMemo(
    () => simulateNetwork(activeEnv.closures),
    [activeEnv.closures]
  );

  const heroStats = [
    {
      label: "Delayed flights",
      value: sim.metrics.delayedFlights,
      color: "text-[#B45309]",
    },
    {
      label: "Stranded pax",
      value: sim.metrics.totalStrandedPax,
      color: "text-[#B91C1C]",
    },
    {
      label: "Total delay",
      value: `${sim.metrics.totalDelayMinutes}m`,
      color: "text-[#0F172A]",
    },
  ];

  return (
    <div className="light-grid-bg min-h-screen text-[#0F172A]">
      <SiteNav />

      {/* Act 1: Split Hero with Circular Chronograph Dial */}
      <main
        id="main-content"
        className="mx-auto max-w-6xl px-4 pb-14 pt-10 lg:px-8 lg:pt-14"
      >
        <div className="grid items-center gap-10 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <h1 className="font-display text-4xl font-bold tracking-tight text-[#0F172A] sm:text-5xl">
              One storm. Seventy Indian flights.
            </h1>
            <p className="mt-4 max-w-prose text-base leading-relaxed text-[#475569]">
              Close any of India&apos;s 16 airports and watch delays cascade
              across chained aircraft, passenger connections, and 600-minute
              crew duty clocks—then recover the network with verified AI
              dispatch.
            </p>

            {/* Environment Switcher */}
            <div className="mt-6">
              <div className="font-mono text-xs font-medium text-[#475569]">
                Preview live disruption environment
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {ENVIRONMENTS.map((env) => {
                  const active = env.id === activeEnv.id;
                  return (
                    <button
                      key={env.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setEnvId(env.id)}
                      className={`cursor-pointer rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB] ${
                        active
                          ? "border-[#1D4ED8] bg-[#EFF6FF] text-[#1D4ED8]"
                          : "border-[#E6EBF2] bg-[#FFFFFF] text-[#475569] hover:border-[#CBD5E1] hover:text-[#0F172A]"
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

            {/* Live Computed Deterministic 3-Number Strip */}
            <div className="mt-5 flex flex-wrap items-center gap-6 border-y border-[#E6EBF2] py-3 font-mono tabular-nums">
              {heroStats.map((stat) => (
                <div key={stat.label}>
                  <div className={`text-xl font-bold ${stat.color}`}>
                    {stat.value}
                  </div>
                  <div className="font-sans text-[11px] text-[#475569]">
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>

            {/* Primary & Secondary CTAs */}
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                href={activeEnv.simulatorHref}
                className="inline-flex h-10 items-center gap-2 rounded-md bg-[#1D4ED8] px-4 text-sm font-semibold text-white transition-colors duration-150 hover:bg-[#1E40AF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB] focus-visible:ring-offset-2"
              >
                <span>Open Live Simulator</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <a
                href="#architecture"
                className="inline-flex h-10 items-center gap-2 rounded-md border border-[#CBD5E1] bg-[#FFFFFF] px-4 text-sm font-semibold text-[#0F172A] transition-colors duration-150 hover:bg-[#F1F5F9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB]"
              >
                Explore Architecture
              </a>
            </div>
          </div>

          <div className="lg:col-span-7">
            <AnimeHeroDial
              environmentTitle={activeEnv.label}
              simulation={sim}
              clockMin={activeEnv.clockMin}
            />
          </div>
        </div>
      </main>

      {/* Act 2: Warm Drafting-Paper Scroll-Scrubbed Isometric Stack */}
      <ExplodedBlueprint />

      {/* Act 3: Sticky Chronograph Feature Stage */}
      <LandingModules />

      {/* Clean Architectural Footer */}
      <footer className="border-t border-[#E6EBF2] bg-[#FFFFFF] py-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 text-xs text-[#475569] lg:px-8">
          <span className="font-mono">
            Domino Sky · 16 Indian airports · 70 flights · 21 connections · 16
            crews · 2 spares
          </span>
          <div className="flex items-center gap-4 font-mono font-medium">
            <Link
              href="/simulator"
              className="rounded px-1 py-0.5 hover:text-[#0F172A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB]"
            >
              Simulator
            </Link>
            <Link
              href="/about"
              className="rounded px-1 py-0.5 hover:text-[#0F172A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB]"
            >
              About
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
