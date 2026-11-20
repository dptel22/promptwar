"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, CloudLightning, Minus, Plus, RotateCcw, X } from "lucide-react";
import {
  AIRPORT_LABEL_OFFSETS,
  MAP_VIEWBOX,
  SPARE_BADGE_OFFSETS,
  buildArcPath,
  holdingOrbitPosition,
  interpolateFlightPosition,
  projectLatLng,
} from "@/lib/geo";
import type { AirportFragilityRank } from "@/lib/ml/predict";
import { DATASET, formatHHMM } from "@/lib/sim/engine";
import type {
  Airport,
  AirportClosure,
  RecoveryCandidate,
  SimulatedFlight,
  SimulationResult,
} from "@/lib/sim/types";
import { IndiaReliefLayer } from "./IndiaReliefLayer";

interface RadarMapProps {
  simulation: SimulationResult;
  previewCandidate: RecoveryCandidate | null;
  clockMin: number;
  selectedFlightId: string | null;
  selectedAirportId: string | null;
  isStormDragging: boolean;
  showFragilityOverlay: boolean;
  airportFragilities: AirportFragilityRank[];
  focusAirportSignal?: { airportId: string; nonce: number } | null;
  topLeftOverlay?: React.ReactNode;
  onSelectFlight: (flightId: string) => void;
  onSelectAirport: (airportId: string | null) => void;
  onDropStormOnAirport: (airportId: string) => void;
  onRemoveClosure: (airportId: string) => void;
}

const AIRPORT_POINTS = new Map(
  DATASET.airports.map((a) => [a.id, projectLatLng(a.lat, a.lng)])
);

const UNIQUE_ROUTES: Array<{ key: string; from: string; to: string }> = (() => {
  const seen = new Set<string>();
  const out: Array<{ key: string; from: string; to: string }> = [];
  for (const f of DATASET.flights) {
    const pair = [f.origin, f.destination].sort().join("-");
    if (seen.has(pair)) continue;
    seen.add(pair);
    out.push({ key: pair, from: f.origin, to: f.destination });
  }
  return out;
})();

const FOCUS_HUBS = ["BOM", "DEL", "BLR", "HYD"] as const;

function clampCamera(scale: number, tx: number, ty: number) {
  const clampedScale = Math.max(0.95, Math.min(4.5, scale));
  const maxTx = MAP_VIEWBOX.width * clampedScale * 0.55;
  const maxTy = MAP_VIEWBOX.height * clampedScale * 0.55;
  return {
    scale: Math.round(clampedScale * 100) / 100,
    tx: Math.round(Math.max(-maxTx, Math.min(maxTx, tx)) * 10) / 10,
    ty: Math.round(Math.max(-maxTy, Math.min(maxTy, ty)) * 10) / 10,
  };
}

function handleSvgKeyActivate(
  e: React.KeyboardEvent,
  callback: () => void
) {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    e.stopPropagation();
    callback();
  }
}

export function RadarMap({
  simulation,
  previewCandidate,
  clockMin,
  selectedFlightId,
  selectedAirportId,
  isStormDragging,
  showFragilityOverlay,
  airportFragilities,
  focusAirportSignal,
  topLeftOverlay,
  onSelectFlight,
  onSelectAirport,
  onDropStormOnAirport,
  onRemoveClosure,
}: RadarMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [camera, setCamera] = useState({ scale: 1.04, tx: 0, ty: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    origTx: number;
    origTy: number;
    moved: boolean;
  } | null>(null);

  const [routeFilter, setRouteFilter] = useState<"cascade" | "all">("cascade");
  const [dragOverAirport, setDragOverAirport] = useState<string | null>(null);
  const [hoveredFlightId, setHoveredFlightId] = useState<string | null>(null);

  const cx = MAP_VIEWBOX.width / 2;
  const cy = MAP_VIEWBOX.height / 2;

  function focusOnAirport(airportId: string, targetScale = 2.6) {
    const pt = AIRPORT_POINTS.get(airportId);
    if (!pt) return;
    setCamera(
      clampCamera(
        targetScale,
        (cx - pt.x) * targetScale,
        (cy - pt.y) * targetScale
      )
    );
  }

  function resetCamera() {
    setCamera({ scale: 1.04, tx: 0, ty: 0 });
  }

  function zoomBy(multiplier: number) {
    setCamera((prev) => {
      const nextScale = Math.max(0.95, Math.min(4.5, prev.scale * multiplier));
      const ratio = nextScale / prev.scale;
      return clampCamera(nextScale, prev.tx * ratio, prev.ty * ratio);
    });
  }

  useEffect(() => {
    if (focusAirportSignal) {
      focusOnAirport(focusAirportSignal.airportId, 2.5);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusAirportSignal]);

  // Cursor-centered non-passive wheel zoom mapped cleanly through preserveAspectRatio="xMidYMid meet"
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const scaleFactor =
        Math.min(rect.width / MAP_VIEWBOX.width, rect.height / MAP_VIEWBOX.height) ||
        1;
      const offsetX = (rect.width - MAP_VIEWBOX.width * scaleFactor) / 2;
      const offsetY = (rect.height - MAP_VIEWBOX.height * scaleFactor) / 2;
      const vx = (e.clientX - rect.left - offsetX) / scaleFactor;
      const vy = (e.clientY - rect.top - offsetY) / scaleFactor;
      const factor = e.deltaY < 0 ? 1.18 : 1 / 1.18;

      setCamera((prev) => {
        const nextScale = Math.max(0.95, Math.min(4.5, prev.scale * factor));
        const ratio = nextScale / prev.scale;
        const nextTx = vx - cx - ratio * (vx - cx - prev.tx);
        const nextTy = vy - cy - ratio * (vy - cy - prev.ty);
        return clampCamera(nextScale, nextTx, nextTy);
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [cx, cy]);

  const invScale = Math.round((1 / Math.pow(camera.scale, 0.72)) * 1000) / 1000;
  const selectedFlight = selectedFlightId
    ? simulation.flightsById[selectedFlightId]
    : undefined;
  const selectedTailId = selectedFlight?.tail_id ?? null;

  const closuresByAirport = useMemo(() => {
    const map = new Map<string, AirportClosure>();
    for (const c of simulation.closures) {
      map.set(c.airportId, c);
    }
    return map;
  }, [simulation.closures]);

  const fragilityByAirport = useMemo(
    () => new Map(airportFragilities.map((f) => [f.airportId, f])),
    [airportFragilities]
  );

  // Precompute airport delay/breach flags once per simulation update
  const airportStatusMap = useMemo(() => {
    const map = new Map<string, { hasBreach: boolean; hasDelay: boolean }>();
    for (const a of DATASET.airports) {
      map.set(a.id, { hasBreach: false, hasDelay: false });
    }
    for (const f of simulation.flights) {
      if (f.status === "CREW_BREACH") {
        const o = map.get(f.origin);
        if (o) o.hasBreach = true;
        const d = map.get(f.destination);
        if (d) d.hasBreach = true;
      } else if (f.status === "DELAYED") {
        const o = map.get(f.origin);
        if (o) o.hasDelay = true;
        const d = map.get(f.destination);
        if (d) d.hasDelay = true;
      }
    }
    return map;
  }, [simulation.flights]);

  // Airborne, holding, and ground-held flights
  const holdingBuckets = new Map<string, SimulatedFlight[]>();
  const groundHeldCounts = new Map<string, number>();
  const airborneFlights: Array<{
    flight: SimulatedFlight;
    x: number;
    y: number;
    angleDeg: number;
    isHolding: boolean;
  }> = [];

  for (const f of simulation.flights) {
    if (f.status === "CANCELLED" || f.status === "CREW_BREACH") continue;

    if (
      f.primaryReason === "PRIMARY_WEATHER_DEP_HOLD" &&
      clockMin >= f.scheduledDepMin &&
      clockMin < f.actualDepMin
    ) {
      groundHeldCounts.set(f.origin, (groundHeldCounts.get(f.origin) ?? 0) + 1);
    }

    if (clockMin < f.actualDepMin || clockMin > f.actualArrMin) continue;

    const isHolding =
      f.holdingStartMin !== null &&
      clockMin >= f.holdingStartMin &&
      clockMin < (f.holdingEndMin ?? f.actualArrMin);

    if (isHolding) {
      const list = holdingBuckets.get(f.destination);
      if (list) list.push(f);
      else holdingBuckets.set(f.destination, [f]);
    } else {
      const fromPt = AIRPORT_POINTS.get(f.origin)!;
      const toPt = AIRPORT_POINTS.get(f.destination)!;
      const cruiseEnd = f.holdingStartMin ?? f.actualArrMin;
      const progress =
        (clockMin - f.actualDepMin) / Math.max(1, cruiseEnd - f.actualDepMin);
      const pos = interpolateFlightPosition(fromPt, toPt, progress);
      airborneFlights.push({ flight: f, ...pos, isHolding: false });
    }
  }

  for (const [airportId, holdingList] of holdingBuckets.entries()) {
    const center = AIRPORT_POINTS.get(airportId)!;
    holdingList.forEach((flight, idx) => {
      const pos = holdingOrbitPosition(center, clockMin, idx);
      airborneFlights.push({ flight, ...pos, isHolding: true });
    });
  }

  const selectedTailFlights = selectedTailId
    ? simulation.flights
        .filter((f) => f.tail_id === selectedTailId)
        .sort((a, b) => a.leg_order - b.leg_order)
    : [];

  const previewDiffFlights = previewCandidate
    ? simulation.flights.filter((beforeF) => {
        const afterF = previewCandidate.result.flightsById[beforeF.flight_id];
        return (
          afterF &&
          (beforeF.status !== afterF.status ||
            beforeF.actualDepMin !== afterF.actualDepMin ||
            beforeF.actualArrMin !== afterF.actualArrMin ||
            beforeF.activeTailId !== afterF.activeTailId)
        );
      })
    : [];

  return (
    <div
      ref={containerRef}
      className={`relative h-full w-full select-none overflow-hidden bg-[radial-gradient(circle_at_50%_46%,#F2F6FC_0%,#FBFCFD_68%)] ${
        isPanning ? "cursor-grabbing" : "cursor-grab"
      }`}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        const target = e.target as HTMLElement;
        if (target.closest("button") || target.closest("[data-interactive='true']")) {
          return;
        }
        dragRef.current = {
          startX: e.clientX,
          startY: e.clientY,
          origTx: camera.tx,
          origTy: camera.ty,
          moved: false,
        };
        setIsPanning(true);
      }}
      onPointerMove={(e) => {
        const d = dragRef.current;
        if (!d) return;
        const dx = e.clientX - d.startX;
        const dy = e.clientY - d.startY;
        if (Math.hypot(dx, dy) > 4) d.moved = true;
        const rect = containerRef.current?.getBoundingClientRect();
        const scaleFactor = rect
          ? Math.min(rect.width / MAP_VIEWBOX.width, rect.height / MAP_VIEWBOX.height) ||
            1
          : 1;
        setCamera((prev) =>
          clampCamera(
            prev.scale,
            d.origTx + dx / scaleFactor,
            d.origTy + dy / scaleFactor
          )
        );
      }}
      onPointerUp={() => {
        if (dragRef.current && !dragRef.current.moved) {
          onSelectAirport(null);
        }
        dragRef.current = null;
        setIsPanning(false);
      }}
      onPointerLeave={() => {
        dragRef.current = null;
        setIsPanning(false);
      }}
      onDragOver={(e) => {
        if (isStormDragging) e.preventDefault();
      }}
      onDrop={() => setDragOverAirport(null)}
    >
      {/* Top-Left Borderless Route Toggles + Floating Flight Stats Overlay */}
      <div className="pointer-events-none absolute left-4 top-3.5 z-10 flex flex-col items-start gap-3">
        <div
          data-interactive="true"
          className="pointer-events-auto flex flex-col gap-1.5"
        >
          <button
            type="button"
            aria-pressed={routeFilter === "cascade"}
            onClick={() => setRouteFilter("cascade")}
            className={`flex cursor-pointer items-center gap-2 rounded-sm text-xs tracking-wide transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB] ${
              routeFilter === "cascade"
                ? "font-semibold text-[#1D4ED8]"
                : "font-medium text-[#475569] hover:text-[#0F172A]"
            }`}
          >
            <span
              className={`flex h-3.5 w-3.5 items-center justify-center rounded-full ${
                routeFilter === "cascade"
                  ? "bg-[#2B79FB]"
                  : "border border-[#CBD5E1] bg-[#FFFFFF]"
              }`}
              aria-hidden="true"
            >
              {routeFilter === "cascade" && (
                <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
              )}
            </span>
            Active Cascade
          </button>
          <button
            type="button"
            aria-pressed={routeFilter === "all"}
            onClick={() => setRouteFilter("all")}
            className={`flex cursor-pointer items-center gap-2 rounded-sm text-xs tracking-wide transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB] ${
              routeFilter === "all"
                ? "font-semibold text-[#1D4ED8]"
                : "font-medium text-[#475569] hover:text-[#0F172A]"
            }`}
          >
            <span
              className={`flex h-3.5 w-3.5 items-center justify-center rounded-full ${
                routeFilter === "all"
                  ? "bg-[#2B79FB]"
                  : "border border-[#CBD5E1] bg-[#FFFFFF]"
              }`}
              aria-hidden="true"
            >
              {routeFilter === "all" && (
                <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
              )}
            </span>
            All 70 Flights
          </button>
        </div>

        {topLeftOverlay && (
          <div data-interactive="true" className="pointer-events-auto">
            {topLeftOverlay}
          </div>
        )}
      </div>

      {/* Top-Right Understated Hub Focus Pills & Dribbble Rounded Vertical + / - Pill */}
      <div className="absolute right-3.5 top-3.5 z-10 flex items-start gap-2">
        <div className="hidden items-center gap-0.5 rounded-full border border-[#E6EBF2] bg-[#FFFFFF] px-1.5 py-1 shadow-[0_2px_10px_rgba(148,163,184,0.12)] sm:flex">
          <button
            type="button"
            onClick={resetCamera}
            className={`cursor-pointer rounded-full px-2.5 py-0.5 font-mono text-[11px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB] ${
              camera.scale <= 1.2
                ? "bg-[#EFF6FF] font-semibold text-[#1D4ED8]"
                : "text-[#475569] hover:bg-[#F8FAFC] hover:text-[#0F172A]"
            }`}
          >
            India
          </button>
          {FOCUS_HUBS.map((hub) => (
            <button
              key={hub}
              type="button"
              onClick={() => focusOnAirport(hub, 2.6)}
              className="cursor-pointer rounded-full px-2.5 py-0.5 font-mono text-[11px] font-medium text-[#475569] transition-colors duration-150 hover:bg-[#F8FAFC] hover:text-[#0F172A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB]"
            >
              {hub}
            </button>
          ))}
        </div>

        <div className="flex flex-col items-center">
          <div className="flex w-8 flex-col overflow-hidden rounded-full border border-[#E6EBF2] bg-[#FFFFFF] shadow-[0_2px_10px_rgba(148,163,184,0.14)]">
            <button
              type="button"
              onClick={() => zoomBy(1.3)}
              aria-label="Zoom in radar map"
              className="flex h-8 w-8 cursor-pointer items-center justify-center border-b border-[#E6EBF2] text-[#475569] transition-colors duration-150 hover:bg-[#F8FAFC] hover:text-[#0F172A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB]"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => zoomBy(1 / 1.3)}
              aria-label="Zoom out radar map"
              className="flex h-8 w-8 cursor-pointer items-center justify-center text-[#475569] transition-colors duration-150 hover:bg-[#F8FAFC] hover:text-[#0F172A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB]"
            >
              <Minus className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <button
            type="button"
            onClick={resetCamera}
            aria-label="Reset map pan and zoom"
            title="Fit India"
            className="mt-1.5 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-[#E6EBF2] bg-[#FFFFFF] text-[#475569] shadow-[0_2px_10px_rgba(148,163,184,0.14)] transition-colors duration-150 hover:bg-[#F8FAFC] hover:text-[#0F172A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB]"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Storm Drag Hint */}
      {isStormDragging && (
        <div className="pointer-events-none absolute left-1/2 top-3.5 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-[#DC2626] bg-[#FFFFFF] px-3.5 py-1.5 text-xs font-semibold text-[#B91C1C] shadow-md">
          <CloudLightning className="h-3.5 w-3.5" aria-hidden="true" />
          Drop storm onto any airport beacon
        </div>
      )}

      <svg
        viewBox={`0 0 ${MAP_VIEWBOX.width} ${MAP_VIEWBOX.height}`}
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full"
        role="img"
        aria-label="Interactive top-down map of India showing 16 airports and live flight chains"
      >
        <g
          transform={`translate(${cx + camera.tx}, ${cy + camera.ty}) scale(${camera.scale}) translate(${-cx}, ${-cy})`}
        >
          <IndiaReliefLayer scaleFactor={invScale} />

          {/* Static Network Route Web (#9EAFD8) */}
          <g aria-hidden="true">
            {UNIQUE_ROUTES.map(({ key, from, to }) => {
              const fromPt = AIRPORT_POINTS.get(from);
              const toPt = AIRPORT_POINTS.get(to);
              if (!fromPt || !toPt) return null;
              return (
                <path
                  key={key}
                  d={buildArcPath(fromPt, toPt)}
                  fill="none"
                  stroke="#9EAFD8"
                  strokeOpacity={
                    selectedTailId ? 0.22 : routeFilter === "all" ? 0.65 : 0.28
                  }
                  strokeWidth={1.0 * invScale}
                />
              );
            })}
          </g>

          {/* Active & Disrupted Arcs */}
          <g aria-hidden="true">
            {simulation.flights.map((f) => {
              const showRoute =
                routeFilter === "all" ||
                f.status !== "ON_TIME" ||
                (clockMin >= f.actualDepMin && clockMin <= f.actualArrMin);
              if (!showRoute) return null;
              const fromPt = AIRPORT_POINTS.get(f.origin)!;
              const toPt = AIRPORT_POINTS.get(f.destination)!;
              const isSelectedTail = f.tail_id === selectedTailId;
              const stroke =
                f.status === "CREW_BREACH"
                  ? "#DC2626"
                  : f.status === "CANCELLED"
                    ? "#94A3B8"
                    : f.status === "DELAYED"
                      ? "#D97706"
                      : "#2B79FB";
              const opacity = selectedTailId
                ? isSelectedTail
                  ? 0.9
                  : 0.1
                : f.status !== "ON_TIME"
                  ? 0.7
                  : 0.42;

              return (
                <path
                  key={`arc-${f.flight_id}`}
                  d={buildArcPath(fromPt, toPt)}
                  fill="none"
                  stroke={stroke}
                  strokeOpacity={opacity}
                  strokeWidth={(f.status !== "ON_TIME" ? 1.8 : 1.2) * invScale}
                />
              );
            })}
          </g>

          {/* Before -> After Ghost Diff Overlay */}
          {previewCandidate && (
            <g aria-label="Recovery preview before and after overlay">
              {previewDiffFlights.map((beforeF) => {
                const afterF =
                  previewCandidate.result.flightsById[beforeF.flight_id];
                const fromPt = AIRPORT_POINTS.get(beforeF.origin)!;
                const toPt = AIRPORT_POINTS.get(beforeF.destination)!;
                const pathD = buildArcPath(fromPt, toPt);
                const mid = interpolateFlightPosition(fromPt, toPt, 0.5);
                const isCancelled = afterF.status === "CANCELLED";

                return (
                  <g key={`ghost-${beforeF.flight_id}`}>
                    <path
                      d={pathD}
                      fill="none"
                      stroke="#94A3B8"
                      strokeWidth={2 * invScale}
                      strokeDasharray={`${5 * invScale} ${4 * invScale}`}
                    />
                    <path
                      d={pathD}
                      fill="none"
                      stroke={isCancelled ? "#DC2626" : "#047857"}
                      strokeWidth={2.6 * invScale}
                    />
                    <g
                      transform={`translate(${mid.x}, ${mid.y}) scale(${invScale})`}
                    >
                      <rect
                        x={-28}
                        y={-9}
                        width={56}
                        height={18}
                        rx={4}
                        fill="#FFFFFF"
                        stroke={isCancelled ? "#DC2626" : "#047857"}
                        strokeWidth={1.2}
                      />
                      <text
                        x={0}
                        y={3.5}
                        textAnchor="middle"
                        fontSize="9"
                        fontFamily="var(--font-mono)"
                        fontWeight="700"
                        fill={isCancelled ? "#B91C1C" : "#047857"}
                      >
                        {isCancelled
                          ? "CANCEL"
                          : afterF.isSpareOperated && !beforeF.isSpareOperated
                            ? afterF.activeTailId.slice(-4)
                            : afterF.delayMin < beforeF.delayMin
                              ? `-${beforeF.delayMin - afterF.delayMin}m`
                              : `+${afterF.delayMin}m`}
                      </text>
                    </g>
                  </g>
                );
              })}
            </g>
          )}

          {/* Selected Tail Multi-Hop Domino Focus */}
          {selectedTailFlights.length > 0 && (
            <g aria-label={`Selected domino chain for ${selectedTailId}`}>
              {selectedTailFlights.map((f) => {
                const fromPt = AIRPORT_POINTS.get(f.origin)!;
                const toPt = AIRPORT_POINTS.get(f.destination)!;
                const mid = interpolateFlightPosition(fromPt, toPt, 0.48);
                const strokeColor =
                  f.status === "CREW_BREACH"
                    ? "#DC2626"
                    : f.status === "CANCELLED"
                      ? "#94A3B8"
                      : f.status === "DELAYED"
                        ? "#D97706"
                        : "#2B79FB";
                return (
                  <g key={`chain-${f.flight_id}`}>
                    <path
                      d={buildArcPath(fromPt, toPt)}
                      fill="none"
                      stroke={strokeColor}
                      strokeWidth={2.6 * invScale}
                      strokeDasharray={
                        f.status === "CANCELLED"
                          ? `${4 * invScale} ${4 * invScale}`
                          : `${7 * invScale} ${5 * invScale}`
                      }
                      className={
                        f.status === "CANCELLED" ? undefined : "domino-arc-flow"
                      }
                    />
                    <g
                      data-interactive="true"
                      role="button"
                      tabIndex={0}
                      aria-label={`Select leg ${f.leg_order} flight ${f.flight_id} (${f.origin} to ${f.destination})`}
                      transform={`translate(${mid.x}, ${mid.y}) scale(${invScale})`}
                      className="cursor-pointer focus:outline-none"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectFlight(f.flight_id);
                      }}
                      onKeyDown={(e) =>
                        handleSvgKeyActivate(e, () => onSelectFlight(f.flight_id))
                      }
                    >
                      <circle
                        r={10}
                        fill="#FFFFFF"
                        stroke={strokeColor}
                        strokeWidth={1.8}
                      />
                      <text
                        x={0}
                        y={3.5}
                        textAnchor="middle"
                        fontSize="9.5"
                        fontFamily="var(--font-mono)"
                        fontWeight="700"
                        fill="#0F172A"
                      >
                        {f.leg_order}
                      </text>
                    </g>
                  </g>
                );
              })}
            </g>
          )}

          {/* Active Storm Cells */}
          {simulation.closures.map((closure) => {
            const pt = AIRPORT_POINTS.get(closure.airportId);
            if (!pt) return null;
            const isActiveNow =
              clockMin >= closure.startMin && clockMin < closure.endMin;
            const heldCount = groundHeldCounts.get(closure.airportId) ?? 0;

            return (
              <g key={`storm-${closure.id}`}>
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={40 * invScale}
                  fill="#DC2626"
                  fillOpacity={isActiveNow ? 0.12 : 0.05}
                />
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={34 * invScale}
                  fill="none"
                  stroke="#DC2626"
                  strokeWidth={1.5 * invScale}
                  strokeDasharray={`${4 * invScale} ${4 * invScale}`}
                  strokeOpacity={isActiveNow ? 0.85 : 0.4}
                  className={isActiveNow ? "radar-storm-ring" : undefined}
                />

                <g
                  data-interactive="true"
                  transform={`translate(${pt.x + 14 * invScale}, ${pt.y - 26 * invScale}) scale(${invScale})`}
                >
                  <rect
                    x={0}
                    y={-11}
                    width={126}
                    height={21}
                    rx={4}
                    fill="#FFFFFF"
                    stroke="#DC2626"
                    strokeWidth={1.2}
                  />
                  <text
                    x={7}
                    y={3}
                    fontSize="9.5"
                    fontFamily="var(--font-mono)"
                    fontWeight="700"
                    fill="#B91C1C"
                  >
                    {closure.airportId} {formatHHMM(closure.startMin)}–
                    {formatHHMM(closure.endMin)}
                  </text>
                  <g
                    role="button"
                    tabIndex={0}
                    aria-label={`Remove storm closure at ${closure.airportId}`}
                    transform="translate(114, -1)"
                    className="cursor-pointer focus:outline-none"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveClosure(closure.airportId);
                    }}
                    onKeyDown={(e) =>
                      handleSvgKeyActivate(e, () =>
                        onRemoveClosure(closure.airportId)
                      )
                    }
                  >
                    <circle r={6.5} fill="#FEE2E2" />
                    <text
                      x={0}
                      y={3}
                      textAnchor="middle"
                      fontSize="9.5"
                      fontWeight="700"
                      fill="#B91C1C"
                      fontFamily="var(--font-mono)"
                    >
                      ×
                    </text>
                  </g>
                </g>

                {heldCount > 0 && (
                  <g
                    transform={`translate(${pt.x + 14 * invScale}, ${pt.y - 4 * invScale}) scale(${invScale})`}
                  >
                    <rect
                      x={0}
                      y={0}
                      width={60}
                      height={16}
                      rx={3}
                      fill="#FEF3C7"
                      stroke="#D97706"
                      strokeWidth={0.9}
                    />
                    <text
                      x={30}
                      y={11}
                      textAnchor="middle"
                      fontSize="8.5"
                      fontFamily="var(--font-mono)"
                      fontWeight="700"
                      fill="#B45309"
                    >
                      {heldCount} HELD
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* ATC Holding Racetrack Rings & De-cluttered Zoom-Aware Summary Pills */}
          {Array.from(holdingBuckets.entries()).map(([airportId, holdingList]) => {
            const center = AIRPORT_POINTS.get(airportId)!;
            return (
              <g key={`orbit-${airportId}`}>
                <ellipse
                  cx={center.x}
                  cy={center.y}
                  rx={28 * invScale}
                  ry={16 * invScale}
                  fill="none"
                  stroke="#D97706"
                  strokeWidth={1.3 * invScale}
                  strokeDasharray={`${3 * invScale} ${3 * invScale}`}
                />

                {camera.scale < 1.6 && holdingList.length > 0 && (
                  <g
                    data-interactive="true"
                    role="button"
                    tabIndex={0}
                    aria-label={`${holdingList.length} flights holding at ${airportId}. Zoom in to inspect.`}
                    transform={`translate(${center.x - 54 * invScale}, ${center.y + 28 * invScale}) scale(${invScale})`}
                    className="cursor-pointer focus:outline-none"
                    onClick={(e) => {
                      e.stopPropagation();
                      focusOnAirport(airportId, 2.4);
                    }}
                    onKeyDown={(e) =>
                      handleSvgKeyActivate(e, () =>
                        focusOnAirport(airportId, 2.4)
                      )
                    }
                  >
                    <rect
                      x={-34}
                      y={-9}
                      width={74}
                      height={18}
                      rx={9}
                      fill="#FEE2E2"
                      stroke="#DC2626"
                      strokeWidth={1.1}
                    />
                    <text
                      x={3}
                      y={3}
                      textAnchor="middle"
                      fontSize="8.5"
                      fontFamily="var(--font-mono)"
                      fontWeight="700"
                      fill="#B91C1C"
                    >
                      {holdingList.length} HOLDING
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* Airport Beacons, Optional Fragility Rings & Drop Targets */}
          {DATASET.airports.map((airport: Airport) => {
            const pt = AIRPORT_POINTS.get(airport.id)!;
            const labelCfg = AIRPORT_LABEL_OFFSETS[airport.id] ?? {
              dx: 12,
              dy: 4,
              anchor: "start",
            };
            const closure = closuresByAirport.get(airport.id);
            const isSelected = selectedAirportId === airport.id;
            const isDragHover = dragOverAirport === airport.id;
            const frag = fragilityByAirport.get(airport.id);

            const st = airportStatusMap.get(airport.id);
            const hasBreach = st?.hasBreach ?? false;
            const hasDelay = st?.hasDelay ?? false;

            const beaconColor =
              closure || hasBreach
                ? "#DC2626"
                : hasDelay
                  ? "#D97706"
                  : "#2B79FB";

            const baseSpare = DATASET.spare_aircraft.find(
              (s) => s.base === airport.id
            );
            const spareUsed = baseSpare
              ? simulation.metrics.sparesUsed.includes(baseSpare.tail_id) ||
                (previewCandidate?.result.metrics.sparesUsed.includes(
                  baseSpare.tail_id
                ) ??
                  false)
              : false;
            const spareOffset = SPARE_BADGE_OFFSETS[airport.id];

            return (
              <g
                key={airport.id}
                data-interactive="true"
                role="button"
                tabIndex={0}
                aria-label={`${airport.id} ${airport.city} airport${closure ? ", closed" : ""}. Click to configure closure.`}
                transform={`translate(${pt.x}, ${pt.y}) scale(${invScale})`}
                className="cursor-pointer focus:outline-none"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectAirport(airport.id);
                }}
                onKeyDown={(e) =>
                  handleSvgKeyActivate(e, () => onSelectAirport(airport.id))
                }
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  focusOnAirport(airport.id, 2.8);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragOverAirport !== airport.id) {
                    setDragOverAirport(airport.id);
                  }
                }}
                onDragLeave={() => {
                  if (dragOverAirport === airport.id) setDragOverAirport(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDragOverAirport(null);
                  onDropStormOnAirport(airport.id);
                }}
              >
                <circle r={20} fill="transparent" />

                {showFragilityOverlay && frag && (
                  <circle
                    r={12 + (frag.fragilityScore / 100) * 14}
                    fill={
                      frag.fragilityScore >= 65
                        ? "#DC2626"
                        : frag.fragilityScore >= 32
                          ? "#D97706"
                          : "#2B79FB"
                    }
                    fillOpacity={0.14}
                    stroke={
                      frag.fragilityScore >= 65
                        ? "#DC2626"
                        : frag.fragilityScore >= 32
                          ? "#D97706"
                          : "#2B79FB"
                    }
                    strokeOpacity={0.5}
                    strokeWidth={1}
                  />
                )}

                {isStormDragging && (
                  <circle
                    r={isDragHover ? 22 : 16}
                    fill={isDragHover ? "rgba(220, 38, 38, 0.14)" : "none"}
                    stroke="#DC2626"
                    strokeWidth={isDragHover ? 2 : 1.1}
                    strokeDasharray="3 3"
                  />
                )}

                {isSelected && (
                  <circle
                    r={13}
                    fill="none"
                    stroke="#2B79FB"
                    strokeWidth={1.8}
                  />
                )}

                <circle
                  r={
                    airport.tier === "mega_hub"
                      ? 5.5
                      : airport.tier === "regional_hub"
                        ? 4.4
                        : 3.4
                  }
                  fill={beaconColor}
                  stroke="#FFFFFF"
                  strokeWidth={1.8}
                />

                <text
                  x={labelCfg.dx}
                  y={labelCfg.dy}
                  textAnchor={labelCfg.anchor}
                  fontSize={airport.tier === "mega_hub" ? "11.5" : "10"}
                  fontFamily="var(--font-mono)"
                  fontWeight={airport.tier === "mega_hub" ? "700" : "600"}
                  fill={closure || hasBreach ? "#B91C1C" : "#0F172A"}
                >
                  {airport.id}
                </text>

                {baseSpare && spareOffset && camera.scale >= 1.25 && (
                  <g
                    transform={`translate(${spareOffset.dx}, ${spareOffset.dy})`}
                  >
                    <rect
                      x={airport.id === "BLR" ? -74 : 0}
                      y={-8}
                      width={74}
                      height={15}
                      rx={3}
                      fill={spareUsed ? "#ECFDF5" : "#FFFFFF"}
                      stroke={spareUsed ? "#047857" : "#CBD5E1"}
                      strokeWidth={1}
                    />
                    <text
                      x={airport.id === "BLR" ? -37 : 37}
                      y={2.5}
                      textAnchor="middle"
                      fontSize="8.5"
                      fontFamily="var(--font-mono)"
                      fontWeight="600"
                      fill={spareUsed ? "#047857" : "#475569"}
                    >
                      {spareUsed
                        ? `${baseSpare.tail_id.slice(-4)} ACTIVE`
                        : `SPARE ${baseSpare.tail_id.slice(-4)}`}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* Live Animated Aircraft */}
          {airborneFlights.map(({ flight, x, y, angleDeg, isHolding }) => {
            const isSelected =
              flight.flight_id === selectedFlightId ||
              flight.tail_id === selectedTailId;
            const isHovered = flight.flight_id === hoveredFlightId;
            const color = isHolding
              ? "#DC2626"
              : flight.isSpareOperated
                ? "#047857"
                : flight.delayMin > 0
                  ? "#D97706"
                  : "#2B79FB";

            const showCallout = isHolding
              ? camera.scale >= 1.6 || isSelected || isHovered
              : isSelected ||
                isHovered ||
                (camera.scale >= 1.85 && flight.delayMin > 0);

            // Radially offset holding callout away from hub center to prevent sibling overlap
            let calloutX = 10;
            let calloutY = -10;
            if (isHolding) {
              const hubCenter = AIRPORT_POINTS.get(flight.destination);
              if (hubCenter) {
                const dx = x - hubCenter.x;
                const dy = y - hubCenter.y;
                const len = Math.hypot(dx, dy) || 1;
                const ux = dx / len;
                const uy = dy / len;
                calloutX = ux >= 0 ? ux * 14 : ux * 14 - 72;
                calloutY = uy * 16;
              }
            }

            return (
              <g
                key={`plane-${flight.flight_id}`}
                data-interactive="true"
                role="button"
                tabIndex={0}
                aria-label={`Flight ${flight.flight_id} (${flight.origin} to ${flight.destination}), ${
                  isHolding
                    ? "holding"
                    : flight.delayMin > 0
                      ? `delayed ${flight.delayMin} minutes`
                      : "on time"
                }`}
                transform={`translate(${x}, ${y}) scale(${invScale})`}
                className="cursor-pointer focus:outline-none"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectFlight(flight.flight_id);
                }}
                onKeyDown={(e) =>
                  handleSvgKeyActivate(e, () => onSelectFlight(flight.flight_id))
                }
                onMouseEnter={() => setHoveredFlightId(flight.flight_id)}
                onMouseLeave={() => setHoveredFlightId(null)}
              >
                <circle r={12} fill="transparent" />
                {isSelected && (
                  <circle
                    r={11}
                    fill="none"
                    stroke="#2B79FB"
                    strokeWidth={1.6}
                    strokeDasharray="3 2"
                  />
                )}
                <g transform={`rotate(${angleDeg})`}>
                  <path
                    d="M8.5 0 L2.5 1.8 L-2.5 7.5 L-4.5 7.5 L-1.8 1.8 L-6.2 1.2 L-8 3.6 L-9.4 3.6 L-8.4 0 L-9.4 -3.6 L-8 -3.6 L-6.2 -1.2 L-1.8 -1.8 L-4.5 -7.5 L-2.5 -7.5 L2.5 -1.8 Z"
                    fill={color}
                    stroke="#FFFFFF"
                    strokeWidth={1}
                  />
                </g>

                {showCallout && (
                  <g transform={`translate(${calloutX}, ${calloutY})`}>
                    <rect
                      x={0}
                      y={-8}
                      width={isHolding ? 72 : 66}
                      height={15}
                      rx={3}
                      fill="#FFFFFF"
                      stroke={color}
                      strokeWidth={1}
                    />
                    <text
                      x={4}
                      y={2.5}
                      fontSize="8.5"
                      fontFamily="var(--font-mono)"
                      fontWeight="700"
                      fill={isHolding ? "#B91C1C" : "#0F172A"}
                    >
                      {flight.flight_id}
                      {isHolding
                        ? " HOLD"
                        : flight.delayMin > 0
                          ? ` +${flight.delayMin}m`
                          : ""}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* Bottom-Left Compact Legend */}
      <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex items-center gap-3 rounded-full border border-[#E6EBF2] bg-[#FFFFFF] px-3.5 py-1.5 text-[11px] font-medium text-[#475569] shadow-[0_2px_12px_rgba(148,163,184,0.12)]">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[#2B79FB]" />
          On time
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[#D97706]" />
          Delayed
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[#DC2626]" />
          Storm / hold
        </span>
        {previewCandidate && (
          <span className="flex items-center gap-1.5 font-semibold text-[#047857]">
            <span className="h-2 w-2 rounded-full bg-[#047857]" />
            Recovery preview
          </span>
        )}
      </div>

      {/* Bottom-Right Zoom Readout & Active Closure Removal */}
      <div className="absolute bottom-3 right-3 z-10 flex items-center gap-2">
        {simulation.closures.map((c) => (
          <div
            key={`chip-${c.id}`}
            className="flex items-center gap-1.5 rounded-full border border-[#FECACA] bg-[#FFFFFF] px-2.5 py-1 font-mono text-[11px] font-semibold text-[#B91C1C] shadow-[0_2px_10px_rgba(148,163,184,0.12)]"
          >
            <CloudLightning className="h-3 w-3" aria-hidden="true" />
            <span>
              {c.airportId} {formatHHMM(c.startMin)}–{formatHHMM(c.endMin)}
            </span>
            <button
              type="button"
              onClick={() => onRemoveClosure(c.airportId)}
              aria-label={`Remove closure at ${c.airportId}`}
              className="cursor-pointer rounded-full p-0.5 text-[#475569] hover:bg-[#FEE2E2] hover:text-[#B91C1C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB]"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </div>
        ))}
        <span className="rounded-full border border-[#E6EBF2] bg-[#FFFFFF] px-2.5 py-1 font-mono text-[11px] text-[#475569] shadow-[0_2px_10px_rgba(148,163,184,0.12)]">
          {Math.round(camera.scale * 100)}%
        </span>
      </div>
    </div>
  );
}
