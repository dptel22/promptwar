/**
 * Kinetic SVG Indian aviation chronograph dial with scroll-linked ring rotation,
 * pointer tilt, moving aircraft gliders, and idle RAF throttling.
 */

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AIRCRAFT_GLYPH_PATH, AIRPORT_LABEL_OFFSETS, AIRPORT_POINTS,
  buildArcPath, describeArc, holdingOrbitPosition, interpolateFlightPosition, polarToCartesian, round2,
} from "@/lib/geo";
import { CLOCK_MAX, CLOCK_MIN, DATASET, formatHHMM } from "@/lib/sim/constants";
import type { SimulatedFlight, SimulationResult } from "@/lib/sim/types";
import { IndiaReliefLayer } from "./IndiaReliefLayer";

/** Props for the kinetic hero aviation chronograph dial. */
export interface AnimeHeroDialProps {
  environmentTitle: string;
  simulation: SimulationResult;
  clockMin: number;
  routeMode?: "top" | "all";
}

const DAY_SPAN = CLOCK_MAX - CLOCK_MIN;
const MAP_SCALE = 0.45;
const INV_SCALE = 2.22;
const HIGHLIGHT_HUBS = new Set(["BOM", "DEL", "BLR", "HYD", "MAA", "CCU", "GAU"]);
const RULER_TICKS = Array.from({ length: 28 }, (_, i) => i);

const DIAL_TICKS = Array.from({ length: 120 }, (_, idx) => {
  const angleDeg = idx * 3;
  const isMajor = idx % 10 === 0;
  const isMed = !isMajor && idx % 5 === 0;
  const p1 = polarToCartesian(300, 300, isMajor ? 243 : isMed ? 248 : 252, angleDeg);
  const p2 = polarToCartesian(300, 300, 258, angleDeg);
  return { idx, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, isMajor, isMed };
});

const KINETIC_PATHS = [
  { id: "nominal", start: 8, end: 82, color: "#2B79FB" },
  { id: "cascade", start: 98, end: 172, color: "#D97706" },
  { id: "cutoff", start: 188, end: 262, color: "#DC2626" },
  { id: "recovery", start: 278, end: 352, color: "#059669" },
].map((seg) => ({ ...seg, d: describeArc(300, 300, 276, seg.start, seg.end) }));

const CARDINAL_MARKERS = [
  { label: "05:30", angle: 0 }, { label: "09:45", angle: 90 },
  { label: "14:00", angle: 180 }, { label: "18:15", angle: 270 },
].map((m) => ({ label: m.label, ...polarToCartesian(300, 300, 291, m.angle) }));

const LEGEND_ITEMS = [
  { label: "Nominal", dotClass: "bg-[#2B79FB]" }, { label: "Cascade", dotClass: "bg-[#D97706]" },
  { label: "Cutoff", dotClass: "bg-[#DC2626]" }, { label: "Recovery", dotClass: "bg-[#059669]" },
] as const;

function computeAirbornePlanes(flights: SimulatedFlight[], liveClock: number) {
  const planes: Array<{ flight: SimulatedFlight; x: number; y: number; angleDeg: number }> = [];
  for (const f of flights) {
    if (planes.length >= 20) break;
    if (f.status === "CANCELLED" || f.status === "CREW_BREACH") continue;
    if (liveClock < f.actualDepMin || liveClock > f.actualArrMin) continue;
    const fromPt = AIRPORT_POINTS.get(f.origin);
    const toPt = AIRPORT_POINTS.get(f.destination);
    if (!fromPt || !toPt) continue;
    if (f.holdingStartMin !== null && f.holdingEndMin !== null && liveClock >= f.holdingStartMin && liveClock <= f.holdingEndMin) {
      planes.push({ flight: f, ...holdingOrbitPosition(toPt, liveClock, planes.length) });
      continue;
    }
    const flightEnd = f.holdingStartMin ?? f.actualArrMin;
    const progress = (liveClock - f.actualDepMin) / Math.max(1, flightEnd - f.actualDepMin);
    planes.push({ flight: f, ...interpolateFlightPosition(fromPt, toPt, progress) });
  }
  return planes;
}

/**
 * Renders the interactive circular aviation dial framing India's live airspace.
 */
export function AnimeHeroDial({
  environmentTitle,
  simulation,
  clockMin: baseClockMin,
  routeMode,
}: AnimeHeroDialProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeRouteMode, setActiveRouteMode] = useState<"top" | "all">(routeMode ?? "top");
  const [animOffset, setAnimOffset] = useState(0);
  const [pointerTilt, setPointerTilt] = useState(0);
  const [scrollY, setScrollY] = useState(0);
  const [isVisible, setIsVisible] = useState(true);
  const [isTabVisible, setIsTabVisible] = useState(true);

  useEffect(() => {
    if (routeMode) setActiveRouteMode(routeMode);
  }, [routeMode]);

  useEffect(() => {
    setAnimOffset(0);
  }, [baseClockMin, environmentTitle]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let scrollRafId = 0;
    const onVisibility = () => setIsTabVisible(!document.hidden);
    const syncScroll = () => setScrollY(Math.min(700, Math.max(0, window.scrollY)));
    const scheduleScroll = () => {
      // Coalesce high-frequency scroll events onto one RAF frame for smooth ring rotation.
      if (scrollRafId !== 0) return;
      scrollRafId = window.requestAnimationFrame(() => {
        scrollRafId = 0;
        syncScroll();
      });
    };

    onVisibility();
    syncScroll();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("scroll", scheduleScroll, { passive: true });

    let observer: IntersectionObserver | null = null;
    if (containerRef.current && "IntersectionObserver" in window) {
      observer = new IntersectionObserver((entries) => {
        if (entries[0]) setIsVisible(entries[0].isIntersecting);
      }, { threshold: 0.05 });
      observer.observe(containerRef.current);
    }
    return () => {
      if (scrollRafId !== 0) window.cancelAnimationFrame(scrollRafId);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("scroll", scheduleScroll);
      observer?.disconnect();
    };
  }, []);

  useEffect(() => {
    // Pause the live glider RAF loop only when offscreen or on hidden tabs.
    if (!isVisible || !isTabVisible) return;
    let frameId = 0;
    let lastTs = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, Math.max(0, (now - lastTs) / 1000));
      lastTs = now;
      setAnimOffset((prev) => (prev + dt * 3.5) % 90);
      frameId = window.requestAnimationFrame(tick);
    };
    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [isVisible, isTabVisible]);

  const liveClock = Math.min(CLOCK_MAX, baseClockMin + animOffset);
  const closedIds = useMemo(() => new Set(simulation.closures.map((c) => c.airportId)), [simulation.closures]);
  const visibleFlights = useMemo(() => {
    if (activeRouteMode === "all") return simulation.flights;
    return simulation.flights.filter(
      (f) => f.status !== "ON_TIME" || closedIds.has(f.origin) || closedIds.has(f.destination) || f.leg_order <= 2
    );
  }, [simulation.flights, activeRouteMode, closedIds]);
  const airborne = useMemo(() => computeAirbornePlanes(simulation.flights, liveClock), [simulation.flights, liveClock]);

  const clockProgress = Math.max(0, Math.min(1, (liveClock - CLOCK_MIN) / DAY_SPAN));
  const needlePos = polarToCartesian(300, 300, 250, round2(clockProgress * 360));
  const scrollAngle = round2(Math.min(48, scrollY * 0.08));
  const ringRotation = round2(animOffset * 0.65 + pointerTilt + scrollAngle);
  const tickRotation = round2(-scrollAngle * 0.65);
  const rulerPct = round2(clockProgress * 100);

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width > 0) setPointerTilt(round2(((e.clientX - rect.left) / rect.width - 0.5) * 8));
  }

  return (
    <div ref={containerRef} onPointerMove={handlePointerMove} onPointerLeave={() => setPointerTilt(0)} className="relative flex flex-col items-center">
      <div className="mb-2 flex w-full flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2 font-mono text-xs text-[#0F172A]">
          <span className="h-2 w-2 rounded-full bg-[#DC2626]" aria-hidden="true" />
          <span className="font-semibold">{environmentTitle}</span>
          <span className="text-[#475569]">· {simulation.closures.length} active closure{simulation.closures.length === 1 ? "" : "s"}</span>
        </div>

        <div role="group" aria-label="Flight route density" className="inline-flex items-center rounded-md border border-[#E6EBF2] bg-[#FFFFFF] p-0.5 font-mono text-[11px]">
          {(["top", "all"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={activeRouteMode === mode}
              onClick={() => setActiveRouteMode(mode)}
              className={`cursor-pointer rounded px-2.5 py-1 font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB] ${
                activeRouteMode === mode ? "bg-[#EFF6FF] text-[#1D4ED8]" : "text-[#475569] hover:text-[#0F172A]"
              }`}
            >
              {mode === "top" ? "Top Routes" : "All 70 Flights"}
            </button>
          ))}
        </div>
      </div>

      <div className="relative w-full max-w-[540px]">
        <svg viewBox="-18 -10 636 620" className="h-auto w-full select-none" role="img" aria-label={`${environmentTitle} live Indian aviation chronograph dial at ${formatHHMM(liveClock)} IST`}>
          {/* Single template expression keeps SSR and client SVG text nodes identical (prevents React #418). */}
          <title>{`${environmentTitle} — Live Indian Aviation Network Chronograph`}</title>
          <defs><clipPath id="hero-dial-clip"><circle cx="300" cy="300" r="228" /></clipPath></defs>
          <circle cx="300" cy="300" r="282" fill="none" stroke="#E6EBF2" strokeWidth={1} />
          <circle cx="300" cy="300" r="266" fill="none" stroke="#D5DFEE" strokeWidth={1} strokeDasharray="3 7" className="dial-sweep-ring" />
          <circle cx="300" cy="300" r="234" fill="none" stroke="#E6EBF2" strokeWidth={1} />

          <g transform={`rotate(${ringRotation} 300 300)`}>
            {KINETIC_PATHS.map((arc) => <path key={arc.id} d={arc.d} fill="none" stroke={arc.color} strokeWidth={5.5} strokeLinecap="round" strokeOpacity={0.9} />)}
          </g>
          <g aria-hidden="true">
            {CARDINAL_MARKERS.map((m) => <text key={m.label} x={m.x} y={m.y} textAnchor="middle" dominantBaseline="central" fontSize={9} fontFamily="var(--font-mono)" fontWeight={600} fill="#475569">{m.label}</text>)}
          </g>
          <g aria-hidden="true" transform={`rotate(${tickRotation} 300 300)`}>
            {DIAL_TICKS.map((t) => <line key={t.idx} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke={t.isMajor ? "#64748B" : t.isMed ? "#94A3B8" : "#CBD5E1"} strokeWidth={t.isMajor ? 1.5 : 1} />)}
          </g>
          <circle aria-hidden="true" cx={needlePos.x} cy={needlePos.y} r={4.5} fill="#2B79FB" stroke="#FFFFFF" strokeWidth={1.5} />

          <g clipPath="url(#hero-dial-clip)">
            <circle cx="300" cy="300" r="228" fill="#EEF3F8" />
            <line x1="300" y1="72" x2="300" y2="528" stroke="#DDE6F0" strokeWidth={0.8} />
            <line x1="72" y1="300" x2="528" y2="300" stroke="#DDE6F0" strokeWidth={0.8} />
            <circle cx="300" cy="300" r="142" fill="none" stroke="#DDE6F0" strokeWidth={0.8} strokeDasharray="4 4" />

            <g transform={`translate(300, 300) scale(${MAP_SCALE}) translate(-500, -430)`}>
              <IndiaReliefLayer scaleFactor={INV_SCALE} />
              {visibleFlights.map((f) => {
                const fromPt = AIRPORT_POINTS.get(f.origin);
                const toPt = AIRPORT_POINTS.get(f.destination);
                if (!fromPt || !toPt) return null;
                const isDisrupted = f.status !== "ON_TIME";
                const stroke = f.status === "CREW_BREACH" ? "#DC2626" : f.status === "DELAYED" ? "#D97706" : "#2B79FB";
                return <path key={`dial-arc-${f.flight_id}`} d={buildArcPath(fromPt, toPt)} fill="none" stroke={stroke} strokeWidth={round2((isDisrupted ? 2.1 : 1.25) * INV_SCALE)} strokeOpacity={isDisrupted ? 0.85 : 0.34} className={isDisrupted ? "domino-arc-flow" : undefined} strokeDasharray={isDisrupted ? "12 8" : undefined} />;
              })}
              {simulation.closures.map((c) => {
                const pt = AIRPORT_POINTS.get(c.airportId);
                if (!pt) return null;
                return (
                  <g key={`dial-storm-${c.id}`}>
                    <circle cx={pt.x} cy={pt.y} r={round2(38 * INV_SCALE)} fill="#DC2626" fillOpacity={0.14} />
                    <circle cx={pt.x} cy={pt.y} r={round2(34 * INV_SCALE)} fill="none" stroke="#DC2626" strokeWidth={round2(1.6 * INV_SCALE)} className="radar-storm-ring" />
                  </g>
                );
              })}
              {DATASET.airports.map((a) => {
                const pt = AIRPORT_POINTS.get(a.id);
                if (!pt) return null;
                const isClosed = closedIds.has(a.id);
                const off = AIRPORT_LABEL_OFFSETS[a.id] ?? { dx: 12, dy: 4, anchor: "start" };
                const radius = round2((isClosed ? 6 : a.tier === "mega_hub" ? 4.6 : 3.2) * INV_SCALE);
                return (
                  <g key={`dial-ap-${a.id}`} transform={`translate(${pt.x}, ${pt.y})`}>
                    <circle r={radius} fill={isClosed ? "#DC2626" : "#2B79FB"} stroke="#FFFFFF" strokeWidth={round2(1.4 * INV_SCALE)} />
                    {(HIGHLIGHT_HUBS.has(a.id) || isClosed) && <text x={round2(off.dx * INV_SCALE)} y={round2(off.dy * INV_SCALE)} textAnchor={off.anchor} fontSize={round2(10.5 * INV_SCALE)} fontFamily="var(--font-mono)" fontWeight={700} fill={isClosed ? "#B91C1C" : "#0F172A"}>{a.id}</text>}
                  </g>
                );
              })}
              {airborne.map(({ flight, x, y, angleDeg }) => (
                <g key={`dial-plane-${flight.flight_id}`} transform={`translate(${x}, ${y}) scale(${INV_SCALE}) rotate(${angleDeg})`}>
                  <path d={AIRCRAFT_GLYPH_PATH} fill={flight.delayMin > 0 ? "#D97706" : "#2B79FB"} stroke="#FFFFFF" strokeWidth={0.9} />
                </g>
              ))}
            </g>
          </g>
          <circle cx="300" cy="300" r="228" fill="none" stroke="#CBD5E1" strokeWidth={1.5} />
        </svg>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-3 sm:mt-0">
          <div className="flex flex-wrap items-center gap-3 font-mono text-[11px] text-[#475569]">
            {LEGEND_ITEMS.map((item) => <span key={item.label} className="inline-flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${item.dotClass}`} />{item.label}</span>)}
          </div>
          <div aria-label="Live IST network clock progress" className="ml-auto flex items-center gap-3 rounded-lg bg-[#1E2430] px-3 py-2 text-white shadow-sm">
            <div className="font-mono text-xs font-semibold tabular-nums text-[#F8FAFC]">{formatHHMM(liveClock)} IST</div>
            <div className="relative flex items-center gap-[3px] py-0.5">
              {RULER_TICKS.map((tick) => <span key={tick} className={`w-[1.5px] rounded-full bg-[#64748B] ${tick % 7 === 0 ? "h-3 bg-[#CBD5E1]" : "h-2"}`} />)}
              <span aria-hidden="true" className="absolute -bottom-0.5 -top-0.5 w-0.5 rounded-full bg-[#2B79FB]" style={{ left: `${rulerPct}%` }} />
            </div>
            <span className="font-mono text-[10px] tabular-nums text-[#CBD5E1]">05:30–22:30</span>
          </div>
        </div>
      </div>
    </div>
  );
}
