"use client";

import { useState } from "react";
import { CloudLightning, Plane, X } from "lucide-react";
import indiaGeoRaw from "@/data/india-geo.json";
import {
  AIRPORT_LABEL_OFFSETS,
  MAP_VIEWBOX,
  SPARE_BADGE_OFFSETS,
  buildArcPath,
  geoRingToSvgPath,
  holdingOrbitPosition,
  interpolateFlightPosition,
  projectLatLng,
} from "@/lib/geo";
import { DATASET, formatHHMM } from "@/lib/sim/engine";
import type {
  Airport,
  AirportClosure,
  RecoveryCandidate,
  SimulatedFlight,
  SimulationResult,
} from "@/lib/sim/types";

interface RadarMapProps {
  simulation: SimulationResult;
  previewCandidate: RecoveryCandidate | null;
  clockMin: number;
  selectedFlightId: string | null;
  selectedAirportId: string | null;
  isStormDragging: boolean;
  onSelectFlight: (flightId: string) => void;
  onSelectAirport: (airportId: string | null) => void;
  onDropStormOnAirport: (airportId: string) => void;
  onRemoveClosure: (airportId: string) => void;
}

interface GeoFeature {
  properties: { name: string; kind: string };
  geometry: { type: "Polygon"; coordinates: number[][][] };
}

const INDIA_FEATURES = (indiaGeoRaw as { features: GeoFeature[] }).features;
const AIRPORTS_BY_ID = new Map(DATASET.airports.map((a) => [a.id, a]));
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

const GRATICULE_LATS = [10, 15, 20, 25, 30];
const GRATICULE_LNGS = [70, 75, 80, 85, 90];

export function RadarMap({
  simulation,
  previewCandidate,
  clockMin,
  selectedFlightId,
  selectedAirportId,
  isStormDragging,
  onSelectFlight,
  onSelectAirport,
  onDropStormOnAirport,
  onRemoveClosure,
}: RadarMapProps) {
  const [dragOverAirport, setDragOverAirport] = useState<string | null>(null);
  const [hoveredFlightId, setHoveredFlightId] = useState<string | null>(null);

  const selectedFlight = selectedFlightId
    ? simulation.flightsById[selectedFlightId]
    : undefined;
  const selectedTailId = selectedFlight?.tail_id ?? null;

  const closuresByAirport = new Map<string, AirportClosure>();
  for (const c of simulation.closures) {
    closuresByAirport.set(c.airportId, c);
  }

  // Classify airborne, holding, and tarmac-held flights at current clockMin
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

    // Ground-held at origin waiting for closure release
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

  // Selected tail domino legs
  const selectedTailFlights = selectedTailId
    ? simulation.flights
        .filter((f) => f.tail_id === selectedTailId)
        .sort((a, b) => a.leg_order - b.leg_order)
    : [];

  // Ghost diff flights when previewing an AI recovery candidate
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
      className="relative h-full w-full select-none overflow-hidden bg-[#090D12]"
      onDragOver={(e) => {
        if (isStormDragging) e.preventDefault();
      }}
      onDrop={() => {
        setDragOverAirport(null);
      }}
    >
      {/* Subtle top-center instruction pill only when dragging storm */}
      {isStormDragging && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-md border border-amber-500 bg-[#11161D] px-3 py-1.5 text-xs font-medium text-[#FBBF24] shadow-lg">
          <CloudLightning className="h-3.5 w-3.5" aria-hidden="true" />
          Drop storm cell onto any of the 16 airport beacons
        </div>
      )}

      <svg
        viewBox={`0 0 ${MAP_VIEWBOX.width} ${MAP_VIEWBOX.height}`}
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full"
        role="img"
        aria-label="Interactive radar map of 16 Indian airports and live aircraft chains"
        onClick={(e) => {
          if (e.target === e.currentTarget) onSelectAirport(null);
        }}
      >
        <defs>
          <radialGradient id="stormRadial" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#EF4444" stopOpacity="0.30" />
            <stop offset="65%" stopColor="#EF4444" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#EF4444" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Tactical Lat/Lng Radar Graticule */}
        <g aria-hidden="true">
          {GRATICULE_LATS.map((lat) => {
            const p1 = projectLatLng(lat, 66.8);
            const p2 = projectLatLng(lat, 98.4);
            return (
              <g key={`lat-${lat}`}>
                <line
                  x1={p1.x}
                  y1={p1.y}
                  x2={p2.x}
                  y2={p2.y}
                  stroke="#141C27"
                  strokeWidth={1}
                  strokeDasharray="3 5"
                />
                <text
                  x={14}
                  y={p1.y - 3}
                  fill="#7E8FA6"
                  fontSize="9"
                  fontFamily="var(--font-mono)"
                >
                  {lat}°N
                </text>
              </g>
            );
          })}
          {GRATICULE_LNGS.map((lng) => {
            const p1 = projectLatLng(37.4, lng);
            const p2 = projectLatLng(5.4, lng);
            return (
              <g key={`lng-${lng}`}>
                <line
                  x1={p1.x}
                  y1={p1.y}
                  x2={p2.x}
                  y2={p2.y}
                  stroke="#141C27"
                  strokeWidth={1}
                  strokeDasharray="3 5"
                />
                <text
                  x={p1.x + 4}
                  y={16}
                  fill="#7E8FA6"
                  fontSize="9"
                  fontFamily="var(--font-mono)"
                >
                  {lng}°E
                </text>
              </g>
            );
          })}
        </g>

        {/* India Vector Silhouette */}
        <g aria-hidden="true">
          {INDIA_FEATURES.map((feat, idx) => {
            const isMainland = feat.properties.kind === "mainland";
            const isContext = feat.properties.kind === "context";
            return (
              <path
                key={`${feat.properties.name}-${idx}`}
                d={geoRingToSvgPath(feat.geometry.coordinates[0])}
                fill={isContext ? "#0C1118" : "#111821"}
                stroke={isMainland ? "#243244" : "#1C2736"}
                strokeWidth={isMainland ? 1.5 : 1}
                strokeLinejoin="round"
              />
            );
          })}
        </g>

        {/* Ambient Route Web */}
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
                stroke="#1B2432"
                strokeWidth={1}
              />
            );
          })}
        </g>

        {/* Airborne Route Tracks */}
        <g aria-hidden="true">
          {airborneFlights.map(({ flight, isHolding }) => {
            const fromPt = AIRPORT_POINTS.get(flight.origin)!;
            const toPt = AIRPORT_POINTS.get(flight.destination)!;
            const stroke = isHolding
              ? "#EF4444"
              : flight.delayMin > 0
                ? "#F59E0B"
                : "#10B981";
            return (
              <path
                key={`active-arc-${flight.flight_id}`}
                d={buildArcPath(fromPt, toPt)}
                fill="none"
                stroke={stroke}
                strokeOpacity={flight.tail_id === selectedTailId ? 0.75 : 0.28}
                strokeWidth={flight.tail_id === selectedTailId ? 1.8 : 1.1}
              />
            );
          })}
        </g>

        {/* Before vs After Ghost Diff Overlay */}
        {previewCandidate && (
          <g aria-label="Recovery preview before and after overlay">
            {previewDiffFlights.map((beforeF) => {
              const afterF =
                previewCandidate.result.flightsById[beforeF.flight_id];
              const fromPt = AIRPORT_POINTS.get(beforeF.origin)!;
              const toPt = AIRPORT_POINTS.get(beforeF.destination)!;
              const pathD = buildArcPath(fromPt, toPt);
              const mid = interpolateFlightPosition(fromPt, toPt, 0.5);
              const isNewlyCancelled = afterF.status === "CANCELLED";

              return (
                <g key={`ghost-${beforeF.flight_id}`}>
                  {/* Dashed Before track */}
                  <path
                    d={pathD}
                    fill="none"
                    stroke="#64748B"
                    strokeWidth={2}
                    strokeDasharray="5 4"
                  />
                  {/* Solid After recovered track (or crimson cancel mark) */}
                  <path
                    d={pathD}
                    fill="none"
                    stroke={isNewlyCancelled ? "#EF4444" : "#10B981"}
                    strokeWidth={2.5}
                    strokeOpacity={0.9}
                  />
                  <g transform={`translate(${mid.x}, ${mid.y})`}>
                    <rect
                      x={-26}
                      y={-9}
                      width={52}
                      height={18}
                      rx={3}
                      fill="#11161D"
                      stroke={isNewlyCancelled ? "#EF4444" : "#10B981"}
                      strokeWidth={1}
                    />
                    <text
                      x={0}
                      y={3}
                      textAnchor="middle"
                      fontSize="9"
                      fontFamily="var(--font-mono)"
                      fontWeight="600"
                      fill={isNewlyCancelled ? "#F87171" : "#34D399"}
                    >
                      {isNewlyCancelled
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

        {/* Selected Tail Domino Chain Track */}
        {selectedTailFlights.length > 0 && (
          <g aria-label={`Selected domino chain for ${selectedTailId}`}>
            {selectedTailFlights.map((f) => {
              const fromPt = AIRPORT_POINTS.get(f.origin)!;
              const toPt = AIRPORT_POINTS.get(f.destination)!;
              const mid = interpolateFlightPosition(fromPt, toPt, 0.45);
              const strokeColor =
                f.status === "CREW_BREACH"
                  ? "#EF4444"
                  : f.status === "CANCELLED"
                    ? "#64748B"
                    : f.status === "DELAYED"
                      ? "#F59E0B"
                      : "#10B981";
              return (
                <g key={`chain-${f.flight_id}`}>
                  <path
                    d={buildArcPath(fromPt, toPt)}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth={2.4}
                    strokeDasharray={f.status === "CANCELLED" ? "4 4" : "6 6"}
                    className={
                      f.status === "CANCELLED" ? undefined : "domino-arc-flow"
                    }
                  />
                  <g
                    transform={`translate(${mid.x}, ${mid.y})`}
                    className="cursor-pointer"
                    onClick={() => onSelectFlight(f.flight_id)}
                  >
                    <circle
                      r={9}
                      fill="#11161D"
                      stroke={strokeColor}
                      strokeWidth={1.5}
                    />
                    <text
                      x={0}
                      y={3.5}
                      textAnchor="middle"
                      fontSize="9"
                      fontFamily="var(--font-mono)"
                      fontWeight="700"
                      fill="#F1F5F9"
                    >
                      {f.leg_order}
                    </text>
                  </g>
                </g>
              );
            })}
          </g>
        )}

        {/* Active Storm Cells & ATC Holding Racetrack Rings */}
        {simulation.closures.map((closure) => {
          const pt = AIRPORT_POINTS.get(closure.airportId);
          if (!pt) return null;
          const isActiveAtClock =
            clockMin >= closure.startMin && clockMin < closure.endMin;
          const heldCount = groundHeldCounts.get(closure.airportId) ?? 0;

          return (
            <g key={`storm-${closure.id}`}>
              <circle cx={pt.x} cy={pt.y} r={48} fill="url(#stormRadial)" />
              <circle
                cx={pt.x}
                cy={pt.y}
                r={36}
                fill="none"
                stroke="#EF4444"
                strokeWidth={1.4}
                strokeDasharray="4 4"
                strokeOpacity={isActiveAtClock ? 0.9 : 0.4}
                className={isActiveAtClock ? "radar-storm-ring" : undefined}
              />
              <circle
                cx={pt.x}
                cy={pt.y}
                r={22}
                fill="none"
                stroke="#EF4444"
                strokeWidth={1}
                strokeOpacity={isActiveAtClock ? 0.6 : 0.25}
              />
              {/* Compact closure status tag above-right of beacon */}
              <g transform={`translate(${pt.x + 16}, ${pt.y - 30})`}>
                <rect
                  x={0}
                  y={-11}
                  width={120}
                  height={20}
                  rx={3}
                  fill="#11161D"
                  stroke="#EF4444"
                  strokeWidth={1}
                />
                <text
                  x={7}
                  y={2.5}
                  fontSize="9.5"
                  fontFamily="var(--font-mono)"
                  fontWeight="600"
                  fill="#F87171"
                >
                  {closure.airportId} {formatHHMM(closure.startMin)}–
                  {formatHHMM(closure.endMin)}
                </text>
                <g
                  transform="translate(108, -1)"
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveClosure(closure.airportId);
                  }}
                >
                  <circle r={6} fill="#18202A" />
                  <text
                    x={0}
                    y={3}
                    textAnchor="middle"
                    fontSize="9"
                    fill="#F1F5F9"
                    fontFamily="var(--font-mono)"
                  >
                    ×
                  </text>
                </g>
              </g>
              {heldCount > 0 && (
                <g transform={`translate(${pt.x + 16}, ${pt.y - 8})`}>
                  <rect
                    x={0}
                    y={0}
                    width={62}
                    height={16}
                    rx={2}
                    fill="#18202A"
                    stroke="#F59E0B"
                    strokeWidth={0.8}
                  />
                  <text
                    x={31}
                    y={11}
                    textAnchor="middle"
                    fontSize="8.5"
                    fontFamily="var(--font-mono)"
                    fontWeight="600"
                    fill="#FBBF24"
                  >
                    {heldCount} HELD
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {/* ATC Airborne Holding Racetrack Rings */}
        {Array.from(holdingBuckets.keys()).map((airportId) => {
          const center = AIRPORT_POINTS.get(airportId)!;
          return (
            <ellipse
              key={`orbit-${airportId}`}
              cx={center.x}
              cy={center.y}
              rx={28}
              ry={16}
              fill="none"
              stroke="#F59E0B"
              strokeWidth={1}
              strokeDasharray="3 3"
              strokeOpacity={0.75}
            />
          );
        })}

        {/* Airport Beacons, Non-Colliding Labels & Drop Targets */}
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

          const touching = simulation.flights.filter(
            (f) => f.origin === airport.id || f.destination === airport.id
          );
          const hasBreach = touching.some((f) => f.status === "CREW_BREACH");
          const hasDelay = touching.some((f) => f.status === "DELAYED");

          const beaconColor =
            closure || hasBreach
              ? "#EF4444"
              : hasDelay
                ? "#F59E0B"
                : "#10B981";

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
              transform={`translate(${pt.x}, ${pt.y})`}
              className="cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                onSelectAirport(airport.id);
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
              {/* Generous invisible hit area for clicking and dragging */}
              <circle r={20} fill="transparent" />

              {isStormDragging && (
                <circle
                  r={isDragHover ? 24 : 18}
                  fill={isDragHover ? "rgba(245, 158, 11, 0.16)" : "none"}
                  stroke="#F59E0B"
                  strokeWidth={isDragHover ? 2 : 1.1}
                  strokeDasharray="3 3"
                />
              )}

              {isSelected && (
                <circle
                  r={14}
                  fill="none"
                  stroke="#FBBF24"
                  strokeWidth={1.6}
                />
              )}

              {airport.tier === "mega_hub" && (
                <circle
                  r={9.5}
                  fill="none"
                  stroke={beaconColor}
                  strokeOpacity={0.45}
                  strokeWidth={1.2}
                />
              )}

              {airport.tier !== "spoke" ? (
                <circle
                  r={airport.tier === "mega_hub" ? 5 : 4}
                  fill="#090D12"
                  stroke={beaconColor}
                  strokeWidth={2.2}
                />
              ) : (
                <rect
                  x={-3.2}
                  y={-3.2}
                  width={6.4}
                  height={6.4}
                  rx={1}
                  fill="#090D12"
                  stroke={beaconColor}
                  strokeWidth={1.8}
                />
              )}

              {/* Non-colliding IATA Callout */}
              <text
                x={labelCfg.dx}
                y={labelCfg.dy}
                textAnchor={labelCfg.anchor}
                fontSize={airport.tier === "mega_hub" ? "11.5" : "10"}
                fontFamily="var(--font-mono)"
                fontWeight={airport.tier === "mega_hub" ? "700" : "500"}
                fill={
                  closure || hasBreach
                    ? "#F87171"
                    : hasDelay
                      ? "#FBBF24"
                      : "#F1F5F9"
                }
              >
                {airport.id}
              </text>

              {/* Spare Aircraft Badge at BLR & DEL */}
              {baseSpare && spareOffset && (
                <g
                  transform={`translate(${spareOffset.dx}, ${spareOffset.dy})`}
                >
                  <rect
                    x={airport.id === "BLR" ? -78 : 0}
                    y={-8}
                    width={78}
                    height={15}
                    rx={2}
                    fill="#11161D"
                    stroke={spareUsed ? "#10B981" : "#334155"}
                    strokeWidth={1}
                  />
                  <text
                    x={airport.id === "BLR" ? -39 : 39}
                    y={2.5}
                    textAnchor="middle"
                    fontSize="8.5"
                    fontFamily="var(--font-mono)"
                    fontWeight="600"
                    fill={spareUsed ? "#34D399" : "#94A3B8"}
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

        {/* Live Animated Aircraft Icons */}
        {airborneFlights.map(({ flight, x, y, angleDeg, isHolding }) => {
          const isSelected =
            flight.flight_id === selectedFlightId ||
            flight.tail_id === selectedTailId;
          const isHovered = flight.flight_id === hoveredFlightId;
          const color = isHolding
            ? "#EF4444"
            : flight.isSpareOperated
              ? "#34D399"
              : flight.delayMin > 0
                ? "#F59E0B"
                : "#10B981";

          return (
            <g
              key={`plane-${flight.flight_id}`}
              transform={`translate(${x}, ${y})`}
              className="cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                onSelectFlight(flight.flight_id);
              }}
              onMouseEnter={() => setHoveredFlightId(flight.flight_id)}
              onMouseLeave={() => setHoveredFlightId(null)}
            >
              <circle r={12} fill="transparent" />
              {isSelected && (
                <circle
                  r={11}
                  fill="none"
                  stroke="#FBBF24"
                  strokeWidth={1.4}
                  strokeDasharray="3 2"
                />
              )}
              <g transform={`rotate(${angleDeg})`}>
                <path
                  d="M8.5 0 L2.5 1.8 L-2.5 7.5 L-4.5 7.5 L-1.8 1.8 L-6.2 1.2 L-8 3.6 L-9.4 3.6 L-8.4 0 L-9.4 -3.6 L-8 -3.6 L-6.2 -1.2 L-1.8 -1.8 L-4.5 -7.5 L-2.5 -7.5 L2.5 -1.8 Z"
                  fill={color}
                  stroke="#090D12"
                  strokeWidth={0.9}
                />
              </g>
              {(isSelected || isHovered || isHolding || flight.delayMin >= 45) && (
                <g transform="translate(10, -10)">
                  <rect
                    x={0}
                    y={-8}
                    width={isHolding ? 74 : 50}
                    height={14}
                    rx={2}
                    fill="#11161D"
                    stroke={color}
                    strokeWidth={0.8}
                  />
                  <text
                    x={4}
                    y={2}
                    fontSize="8.5"
                    fontFamily="var(--font-mono)"
                    fontWeight="600"
                    fill="#F1F5F9"
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
      </svg>

      {/* Bottom-Left Solid Matte Radar Legend */}
      <div className="pointer-events-none absolute bottom-3 left-3 z-10 hidden rounded-md border border-[#222C38] bg-[#11161D] px-2.5 py-2 sm:block">
        <div className="flex flex-col gap-1 font-mono text-[10px] text-[#94A3B8]">
          <div className="flex items-center gap-1.5">
            <Plane className="h-3 w-3 text-[#34D399]" aria-hidden="true" />
            <span>On-Time / Spare</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Plane className="h-3 w-3 text-[#FBBF24]" aria-hidden="true" />
            <span>Cascade Delayed</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CloudLightning className="h-3 w-3 text-[#F87171]" aria-hidden="true" />
            <span>Storm / ATC Hold / Breach</span>
          </div>
          {previewCandidate && (
            <div className="mt-0.5 flex items-center gap-1.5 text-[#34D399]">
              <span className="inline-block h-0.5 w-3 bg-[#10B981]" />
              <span>Preview: Before (dashed) → After</span>
            </div>
          )}
        </div>
      </div>

      {/* Bottom-Right Active Closures Quick Chip Strip */}
      {simulation.closures.length > 0 && (
        <div className="absolute bottom-3 right-3 z-10 hidden flex-col items-end gap-1 lg:flex">
          {simulation.closures.map((c) => (
            <div
              key={`chip-${c.id}`}
              className="flex items-center gap-2 rounded-sm border border-red-500/40 bg-[#11161D] px-2 py-1 font-mono text-[11px] text-[#F87171]"
            >
              <CloudLightning className="h-3 w-3 text-red-400" aria-hidden="true" />
              <span>
                {c.airportId} CLOSED {formatHHMM(c.startMin)}–
                {formatHHMM(c.endMin)} IST
              </span>
              <button
                type="button"
                onClick={() => onRemoveClosure(c.airportId)}
                aria-label={`Remove closure at ${c.airportId}`}
                className="cursor-pointer rounded-sm p-0.5 text-[#94A3B8] hover:bg-[#1F2937] hover:text-[#F1F5F9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
