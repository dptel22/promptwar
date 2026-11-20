/**
 * Interactive top-down India air-traffic radar map orchestrator managing pan/zoom
 * camera state, pointer gestures, route filter HUD controls, and SVG layer composition.
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, CloudLightning, Minus, Plus, RotateCcw, X } from "lucide-react";
import { MAP_VIEWBOX, getAirportPoint } from "@/lib/geo";
import type { AirportFragilityRank } from "@/lib/ml/predict";
import { DATASET, formatHHMM } from "@/lib/sim/constants";
import type { AirportClosure, RecoveryCandidate, SimulationResult } from "@/lib/sim/types";
import { IndiaReliefLayer } from "./IndiaReliefLayer";
import { DEFAULT_CAMERA, focusPoint, getInvScale, panByClientDelta, zoomAroundCenter, zoomAtClientPoint } from "./radar/camera";
import { RadarEntities, collectFlightSpatialState, type AirportStatusFlags } from "./radar/RadarEntities";
import { RadarOverlays } from "./radar/RadarOverlays";

/** Props for {@link RadarMap}. */
export interface RadarMapProps {
  simulation: SimulationResult;
  previewCandidate: RecoveryCandidate | null;
  clockMin: number;
  selectedFlightId: string | null;
  selectedAirportId: string | null;
  isStormDragging: boolean;
  showFragilityOverlay: boolean;
  airportFragilities: AirportFragilityRank[];
  focusAirportSignal?: { airportId: string; nonce: number } | null;
  topLeftOverlay?: ReactNode;
  onSelectFlight: (flightId: string) => void;
  onSelectAirport: (airportId: string | null) => void;
  onDropStormOnAirport: (airportId: string) => void;
  onRemoveClosure: (airportId: string) => void;
}

const FOCUS_HUBS = ["BOM", "DEL", "BLR", "HYD"] as const;
const ROUTE_FILTERS = [
  { id: "cascade", label: "Active Cascade" },
  { id: "all", label: "All 70 Flights" },
] as const;

const VIEWBOX_CX = MAP_VIEWBOX.width / 2;
const VIEWBOX_CY = MAP_VIEWBOX.height / 2;
const ZOOM_BTN_CLASS =
  "flex h-8 w-8 cursor-pointer items-center justify-center text-[#475569] transition-colors duration-150 hover:bg-[#F8FAFC] hover:text-[#0F172A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB]";

/**
 * Interactive radar map displaying India's 16-airport network, live airborne legs,
 * holding stacks, storm closures, and recovery preview diffs.
 */
export function RadarMap(props: RadarMapProps) {
  const {
    simulation, previewCandidate, clockMin, selectedFlightId, selectedAirportId,
    isStormDragging, showFragilityOverlay, airportFragilities, focusAirportSignal,
    topLeftOverlay, onSelectFlight, onSelectAirport, onDropStormOnAirport, onRemoveClosure,
  } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const [camera, setCamera] = useState(DEFAULT_CAMERA);
  const [isPanning, setIsPanning] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; origTx: number; origTy: number; moved: boolean } | null>(null);
  const [routeFilter, setRouteFilter] = useState<"cascade" | "all">("cascade");
  const [dragOverAirport, setDragOverAirport] = useState<string | null>(null);
  const [hoveredFlightId, setHoveredFlightId] = useState<string | null>(null);

  const focusOnAirport = useCallback((airportId: string, targetScale = 2.6) => {
    const pt = getAirportPoint(airportId);
    if (pt) setCamera(focusPoint(pt, targetScale));
  }, []);

  const resetCamera = useCallback(() => setCamera(DEFAULT_CAMERA), []);
  const zoomBy = useCallback((multiplier: number) => {
    setCamera((prev) => zoomAroundCenter(prev, multiplier));
  }, []);

  useEffect(() => {
    if (focusAirportSignal) focusOnAirport(focusAirportSignal.airportId, 2.5);
  }, [focusAirportSignal, focusOnAirport]);

  // Non-passive wheel listener enables cursor-centered zooming without scrolling the page.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0) return;
      e.preventDefault();
      setCamera((prev) => zoomAtClientPoint(prev, el.getBoundingClientRect(), e.clientX, e.clientY, e.deltaY));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const invScale = getInvScale(camera.scale);
  const selectedTailId = selectedFlightId ? (simulation.flightsById[selectedFlightId]?.tail_id ?? null) : null;

  const closuresByAirport = useMemo(
    () => new Map<string, AirportClosure>(simulation.closures.map((c) => [c.airportId, c])),
    [simulation.closures]
  );

  const fragilityByAirport = useMemo(
    () => new Map(airportFragilities.map((f) => [f.airportId, f])),
    [airportFragilities]
  );

  const airportStatusMap = useMemo(() => {
    const map = new Map<string, AirportStatusFlags>();
    for (const a of DATASET.airports) map.set(a.id, { hasBreach: false, hasDelay: false });
    for (const f of simulation.flights) {
      if (f.status !== "CREW_BREACH" && f.status !== "DELAYED") continue;
      for (const id of [f.origin, f.destination]) {
        const entry = map.get(id);
        if (!entry) continue;
        if (f.status === "CREW_BREACH") entry.hasBreach = true;
        else entry.hasDelay = true;
      }
    }
    return map;
  }, [simulation.flights]);

  const sparesUsed = useMemo(
    () => new Set([...simulation.metrics.sparesUsed, ...(previewCandidate?.result.metrics.sparesUsed ?? [])]),
    [simulation.metrics.sparesUsed, previewCandidate]
  );

  const { holdingBuckets, groundHeldCounts, airborneFlights } = useMemo(
    () => collectFlightSpatialState(simulation.flights, clockMin),
    [simulation.flights, clockMin]
  );

  const selectedTailFlights = useMemo(() => {
    if (!selectedTailId) return [];
    return simulation.flights.filter((f) => f.tail_id === selectedTailId).sort((a, b) => a.leg_order - b.leg_order);
  }, [simulation.flights, selectedTailId]);

  return (
    <div
      ref={containerRef}
      className={`relative h-full w-full select-none overflow-hidden bg-[radial-gradient(circle_at_50%_46%,#F2F6FC_0%,#FBFCFD_68%)] ${
        isPanning ? "cursor-grabbing" : "cursor-grab"
      }`}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        const target = e.target as HTMLElement;
        if (target.closest("button") || target.closest("[data-interactive='true']")) return;
        dragRef.current = { startX: e.clientX, startY: e.clientY, origTx: camera.tx, origTy: camera.ty, moved: false };
        setIsPanning(true);
      }}
      onPointerMove={(e) => {
        const d = dragRef.current;
        if (!d) return;
        const dx = e.clientX - d.startX;
        const dy = e.clientY - d.startY;
        if (Math.hypot(dx, dy) > 4) d.moved = true;
        const rect = containerRef.current?.getBoundingClientRect();
        setCamera((prev) => panByClientDelta({ scale: prev.scale, tx: d.origTx, ty: d.origTy }, rect, dx, dy));
      }}
      onPointerUp={() => {
        if (dragRef.current && !dragRef.current.moved) onSelectAirport(null);
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
      <div className="pointer-events-none absolute left-4 top-3.5 z-10 flex flex-col items-start gap-3">
        <div data-interactive="true" className="pointer-events-auto flex flex-col gap-1.5">
          {ROUTE_FILTERS.map(({ id, label }) => {
            const active = routeFilter === id;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={active}
                onClick={() => setRouteFilter(id)}
                className={`flex cursor-pointer items-center gap-2 rounded-sm text-xs tracking-wide transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB] ${
                  active ? "font-semibold text-[#1D4ED8]" : "font-medium text-[#475569] hover:text-[#0F172A]"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`flex h-3.5 w-3.5 items-center justify-center rounded-full ${
                    active ? "bg-[#2B79FB]" : "border border-[#CBD5E1] bg-[#FFFFFF]"
                  }`}
                >
                  {active && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
                </span>
                {label}
              </button>
            );
          })}
        </div>
        {topLeftOverlay && <div data-interactive="true" className="pointer-events-auto">{topLeftOverlay}</div>}
      </div>

      <div className="absolute right-3.5 top-3.5 z-10 flex items-start gap-2">
        <div className="hidden items-center gap-0.5 rounded-full border border-[#E6EBF2] bg-[#FFFFFF] px-1.5 py-1 shadow-[0_2px_10px_rgba(148,163,184,0.12)] sm:flex">
          <button
            type="button"
            onClick={resetCamera}
            className={`cursor-pointer rounded-full px-2.5 py-0.5 font-mono text-[11px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB] ${
              camera.scale <= 1.2 ? "bg-[#EFF6FF] font-semibold text-[#1D4ED8]" : "text-[#475569] hover:bg-[#F8FAFC] hover:text-[#0F172A]"
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
            <button type="button" onClick={() => zoomBy(1.3)} aria-label="Zoom in radar map" className={`border-b border-[#E6EBF2] ${ZOOM_BTN_CLASS}`}>
              <Plus className="h-4 w-4" aria-hidden="true" />
            </button>
            <button type="button" onClick={() => zoomBy(1 / 1.3)} aria-label="Zoom out radar map" className={ZOOM_BTN_CLASS}>
              <Minus className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <button
            type="button"
            onClick={resetCamera}
            aria-label="Reset map pan and zoom"
            title="Fit India"
            className={`mt-1.5 rounded-full border border-[#E6EBF2] bg-[#FFFFFF] shadow-[0_2px_10px_rgba(148,163,184,0.14)] ${ZOOM_BTN_CLASS}`}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

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
        <g transform={`translate(${VIEWBOX_CX + camera.tx}, ${VIEWBOX_CY + camera.ty}) scale(${camera.scale}) translate(${-VIEWBOX_CX}, ${-VIEWBOX_CY})`}>
          <IndiaReliefLayer scaleFactor={invScale} />
          <RadarOverlays
            flights={simulation.flights} closures={simulation.closures} previewCandidate={previewCandidate}
            selectedTailFlights={selectedTailFlights} selectedTailId={selectedTailId}
            holdingBuckets={holdingBuckets} groundHeldCounts={groundHeldCounts}
            routeFilter={routeFilter} clockMin={clockMin} cameraScale={camera.scale} invScale={invScale}
            onSelectFlight={onSelectFlight} onRemoveClosure={onRemoveClosure} onFocusAirport={focusOnAirport}
          />
          <RadarEntities
            airborneFlights={airborneFlights} closuresByAirport={closuresByAirport}
            fragilityByAirport={fragilityByAirport} airportStatusMap={airportStatusMap} sparesUsed={sparesUsed}
            selectedFlightId={selectedFlightId} selectedTailId={selectedTailId} selectedAirportId={selectedAirportId}
            hoveredFlightId={hoveredFlightId} dragOverAirport={dragOverAirport}
            isStormDragging={isStormDragging} showFragilityOverlay={showFragilityOverlay}
            cameraScale={camera.scale} invScale={invScale}
            onSelectFlight={onSelectFlight} onSelectAirport={onSelectAirport} onFocusAirport={focusOnAirport}
            onDropStormOnAirport={onDropStormOnAirport} onDragOverAirportChange={setDragOverAirport} onHoverFlightChange={setHoveredFlightId}
          />
        </g>
      </svg>

      <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex items-center gap-3 rounded-full border border-[#E6EBF2] bg-[#FFFFFF] px-3.5 py-1.5 text-[11px] font-medium text-[#475569] shadow-[0_2px_12px_rgba(148,163,184,0.12)]">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#2B79FB]" />On time</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#D97706]" />Delayed</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#DC2626]" />Storm / hold</span>
        {previewCandidate && (
          <span className="flex items-center gap-1.5 font-semibold text-[#047857]">
            <span className="h-2 w-2 rounded-full bg-[#047857]" />Recovery preview
          </span>
        )}
      </div>

      <div className="absolute bottom-3 right-3 z-10 flex items-center gap-2">
        {simulation.closures.map((c) => (
          <div
            key={`chip-${c.id}`}
            className="flex items-center gap-1.5 rounded-full border border-[#FECACA] bg-[#FFFFFF] px-2.5 py-1 font-mono text-[11px] font-semibold text-[#B91C1C] shadow-[0_2px_10px_rgba(148,163,184,0.12)]"
          >
            <CloudLightning className="h-3 w-3" aria-hidden="true" />
            <span>{c.airportId} {formatHHMM(c.startMin)}–{formatHHMM(c.endMin)}</span>
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
