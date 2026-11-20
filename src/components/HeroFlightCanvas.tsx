"use client";

import { useEffect, useMemo, useState } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import {
  AIRPORT_LABEL_OFFSETS,
  MAP_VIEWBOX,
  buildArcPath,
  interpolateFlightPosition,
  projectLatLng,
} from "@/lib/geo";
import { DATASET, formatHHMM } from "@/lib/sim/engine";
import type { SimulationResult } from "@/lib/sim/types";
import { IndiaReliefLayer } from "./IndiaReliefLayer";

interface HeroFlightCanvasProps {
  environmentTitle: string;
  simulation: SimulationResult;
  clockMin: number;
}

const AIRPORT_POINTS = new Map(
  DATASET.airports.map((a) => [a.id, projectLatLng(a.lat, a.lng)])
);

export function HeroFlightCanvas({
  environmentTitle,
  simulation,
  clockMin: baseClockMin,
}: HeroFlightCanvasProps) {
  const [routeMode, setRouteMode] = useState<"top" | "all">("top");
  const [zoom, setZoom] = useState<number>(1.08);
  const [animOffset, setAnimOffset] = useState<number>(0);

  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    let frameId = 0;
    const startTs = performance.now();
    const tick = (now: number) => {
      const elapsedSec = (now - startTs) / 1000;
      setAnimOffset((elapsedSec * 4) % 90);
      frameId = window.requestAnimationFrame(tick);
    };
    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, []);

  const liveClock = baseClockMin + animOffset;
  const closedIds = new Set(simulation.closures.map((c) => c.airportId));

  const visibleFlights = useMemo(() => {
    if (routeMode === "all") return simulation.flights;
    return simulation.flights.filter(
      (f) =>
        f.status !== "ON_TIME" ||
        closedIds.has(f.origin) ||
        closedIds.has(f.destination) ||
        f.leg_order <= 2
    );
  }, [simulation.flights, routeMode, closedIds]);

  const airborne = useMemo(() => {
    return simulation.flights
      .filter(
        (f) =>
          f.status !== "CANCELLED" &&
          f.status !== "CREW_BREACH" &&
          liveClock >= f.actualDepMin &&
          liveClock <= f.actualArrMin
      )
      .slice(0, 18)
      .map((f) => {
        const fromPt = AIRPORT_POINTS.get(f.origin)!;
        const toPt = AIRPORT_POINTS.get(f.destination)!;
        const progress =
          (liveClock - f.actualDepMin) /
          Math.max(1, f.actualArrMin - f.actualDepMin);
        return {
          flight: f,
          ...interpolateFlightPosition(fromPt, toPt, progress),
        };
      });
  }, [simulation.flights, liveClock]);

  const cx = MAP_VIEWBOX.width / 2;
  const cy = MAP_VIEWBOX.height / 2;
  const invScale = 1 / Math.pow(zoom, 0.72);

  return (
    <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] shadow-sm">
      {/* Clean Top Frame Header (Inspired by flightmap-small-800) */}
      <div className="flex h-11 items-center justify-between border-b border-[#E2E8F0] px-4">
        <div className="flex items-center gap-2.5">
          <span className="text-xs font-semibold text-[#0F172A]">
            {environmentTitle}
          </span>
          <span className="font-mono text-[11px] tabular-nums text-[#475569]">
            {formatHHMM(liveClock)} IST
          </span>
        </div>

        <div className="flex items-center gap-3 text-[11px] font-medium text-[#475569]">
          <button
            type="button"
            onClick={() => setRouteMode("top")}
            className={`flex cursor-pointer items-center gap-1.5 transition-colors duration-150 ${
              routeMode === "top"
                ? "font-semibold text-[#2563EB]"
                : "text-[#475569] hover:text-[#0F172A]"
            }`}
          >
            <span
              className={`h-2.5 w-2.5 rounded-full border ${
                routeMode === "top"
                  ? "border-[#2563EB] bg-[#2563EB]"
                  : "border-[#94A3B8]"
              }`}
            />
            Top Routes
          </button>
          <button
            type="button"
            onClick={() => setRouteMode("all")}
            className={`flex cursor-pointer items-center gap-1.5 transition-colors duration-150 ${
              routeMode === "all"
                ? "font-semibold text-[#2563EB]"
                : "text-[#475569] hover:text-[#0F172A]"
            }`}
          >
            <span
              className={`h-2.5 w-2.5 rounded-full border ${
                routeMode === "all"
                  ? "border-[#2563EB] bg-[#2563EB]"
                  : "border-[#94A3B8]"
              }`}
            />
            All Routes
          </button>
        </div>
      </div>

      {/* Sculpted Relief India Canvas */}
      <div className="relative h-[430px] w-full bg-[#EEF2F6] lg:h-[490px]">
        {/* Top-Right Crisp Zoom Stack */}
        <div className="absolute right-3 top-3 z-10 flex flex-col overflow-hidden rounded-lg border border-[#E2E8F0] bg-[#FFFFFF] shadow-sm">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(2.4, z + 0.28))}
            aria-label="Zoom in map preview"
            className="flex h-8 w-8 cursor-pointer items-center justify-center border-b border-[#E2E8F0] text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A]"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.95, z - 0.28))}
            aria-label="Zoom out map preview"
            className="flex h-8 w-8 cursor-pointer items-center justify-center border-b border-[#E2E8F0] text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A]"
          >
            <Minus className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setZoom(1.08)}
            aria-label="Reset map preview zoom"
            className="flex h-8 w-8 cursor-pointer items-center justify-center text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A]"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>

        <svg
          viewBox={`0 0 ${MAP_VIEWBOX.width} ${MAP_VIEWBOX.height}`}
          preserveAspectRatio="xMidYMid meet"
          className="h-full w-full"
          role="img"
          aria-label="Sculpted relief map of India showing live cascading flight routes"
        >
          <g
            transform={`translate(${cx}, ${cy}) scale(${zoom}) translate(${-cx}, ${-cy})`}
          >
            <IndiaReliefLayer scaleFactor={invScale} />

            {/* Route Arcs */}
            {visibleFlights.map((f) => {
              const fromPt = AIRPORT_POINTS.get(f.origin)!;
              const toPt = AIRPORT_POINTS.get(f.destination)!;
              const isDisrupted = f.status !== "ON_TIME";
              const stroke =
                f.status === "CREW_BREACH"
                  ? "#DC2626"
                  : f.status === "DELAYED"
                    ? "#D97706"
                    : "#2563EB";
              return (
                <path
                  key={`hero-arc-${f.flight_id}`}
                  d={buildArcPath(fromPt, toPt)}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={(isDisrupted ? 2.1 : 1.35) * invScale}
                  strokeOpacity={isDisrupted ? 0.82 : 0.34}
                  className={isDisrupted ? "domino-arc-flow" : undefined}
                  strokeDasharray={isDisrupted ? "6 4" : undefined}
                />
              );
            })}

            {/* Storm Shockwave Rings */}
            {simulation.closures.map((c) => {
              const pt = AIRPORT_POINTS.get(c.airportId);
              if (!pt) return null;
              return (
                <g key={`hero-storm-${c.id}`}>
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={38 * invScale}
                    fill="#DC2626"
                    fillOpacity={0.12}
                  />
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={34 * invScale}
                    fill="none"
                    stroke="#DC2626"
                    strokeWidth={1.6 * invScale}
                    className="radar-storm-ring"
                  />
                </g>
              );
            })}

            {/* Airport Nodes & Labels */}
            {DATASET.airports.map((a) => {
              const pt = AIRPORT_POINTS.get(a.id)!;
              const isClosed = closedIds.has(a.id);
              const off = AIRPORT_LABEL_OFFSETS[a.id] ?? {
                dx: 10,
                dy: 4,
                anchor: "start",
              };
              const showLabel = a.tier !== "spoke" || isClosed;

              return (
                <g
                  key={`hero-ap-${a.id}`}
                  transform={`translate(${pt.x}, ${pt.y})`}
                >
                  <circle
                    r={(isClosed ? 6 : a.tier === "mega_hub" ? 4.8 : 3.4) * invScale}
                    fill={isClosed ? "#DC2626" : "#2563EB"}
                    stroke="#FFFFFF"
                    strokeWidth={1.5 * invScale}
                  />
                  {showLabel && (
                    <text
                      x={off.dx * invScale}
                      y={off.dy * invScale}
                      textAnchor={off.anchor}
                      fontSize={11 * invScale}
                      fontFamily="var(--font-mono)"
                      fontWeight={700}
                      fill={isClosed ? "#DC2626" : "#0F172A"}
                    >
                      {a.id}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Moving Aircraft Icons */}
            {airborne.map(({ flight, x, y, angleDeg }) => {
              const color =
                flight.delayMin > 0 ? "#D97706" : "#2563EB";
              return (
                <g
                  key={`hero-plane-${flight.flight_id}`}
                  transform={`translate(${x}, ${y}) scale(${invScale}) rotate(${angleDeg})`}
                >
                  <path
                    d="M8.5 0 L2.5 1.8 L-2.5 7.5 L-4.5 7.5 L-1.8 1.8 L-6.2 1.2 L-8 3.6 L-9.4 3.6 L-8.4 0 L-9.4 -3.6 L-8 -3.6 L-6.2 -1.2 L-1.8 -1.8 L-4.5 -7.5 L-2.5 -7.5 L2.5 -1.8 Z"
                    fill={color}
                    stroke="#FFFFFF"
                    strokeWidth={0.9}
                  />
                </g>
              );
            })}
          </g>
        </svg>

        {/* Bottom Subtle Color Key */}
        <div className="absolute bottom-3 left-3 flex items-center gap-3 rounded-md border border-[#E2E8F0] bg-[#FFFFFF] px-3 py-1.5 text-[11px] font-medium text-[#475569] shadow-sm">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#2563EB]" />
            Nominal route
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#D97706]" />
            Delayed chain
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#DC2626]" />
            Closed hub / crew breach
          </span>
        </div>
      </div>
    </div>
  );
}
