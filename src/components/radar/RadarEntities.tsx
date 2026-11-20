/**
 * Memoized interactive SVG entity layers for the India radar map: airport beacons
 * with fragility/drag rings and spare-tail badges, plus live airborne aircraft glyphs.
 */

import { memo } from "react";
import {
  AIRCRAFT_GLYPH_PATH,
  AIRPORT_LABEL_OFFSETS,
  SPARE_BADGE_OFFSETS,
  getAirportPoint,
  holdingOrbitPosition,
  interpolateFlightPosition,
} from "@/lib/geo";
import type { AirportFragilityRank } from "@/lib/ml/predict";
import { DATASET } from "@/lib/sim/constants";
import type { Airport, AirportClosure, SimulatedFlight } from "@/lib/sim/types";
import { MONO_BOLD_STYLE, svgButtonProps } from "./RadarOverlays";

/** Airborne aircraft coordinate, tangent heading, and holding flag for rendering. */
export interface AirborneFlightItem {
  flight: SimulatedFlight;
  x: number;
  y: number;
  angleDeg: number;
  isHolding: boolean;
}

/** Aggregated disruption status flags for an airport beacon. */
export interface AirportStatusFlags {
  hasBreach: boolean;
  hasDelay: boolean;
}

/** Memoizable snapshot of airborne, holding, and ground-held aircraft at `clockMin`. */
export interface FlightSpatialState {
  holdingBuckets: Map<string, SimulatedFlight[]>;
  groundHeldCounts: Map<string, number>;
  airborneFlights: AirborneFlightItem[];
}

/** Props for {@link RadarEntities}. */
export interface RadarEntitiesProps {
  airborneFlights: AirborneFlightItem[];
  closuresByAirport: ReadonlyMap<string, AirportClosure>;
  fragilityByAirport: ReadonlyMap<string, AirportFragilityRank>;
  airportStatusMap: ReadonlyMap<string, AirportStatusFlags>;
  sparesUsed: ReadonlySet<string>;
  selectedFlightId: string | null;
  selectedTailId: string | null;
  selectedAirportId: string | null;
  hoveredFlightId: string | null;
  dragOverAirport: string | null;
  isStormDragging: boolean;
  showFragilityOverlay: boolean;
  cameraScale: number;
  invScale: number;
  onSelectFlight: (flightId: string) => void;
  onSelectAirport: (airportId: string | null) => void;
  onFocusAirport: (airportId: string, targetScale?: number) => void;
  onDropStormOnAirport: (airportId: string) => void;
  onDragOverAirportChange: (airportId: string | null) => void;
  onHoverFlightChange: (flightId: string | null) => void;
}

/**
 * Collects airborne aircraft coordinates, ATC holding orbits, and ground-held counts
 * for the given simulation minute while safely skipping unknown airport references.
 */
export function collectFlightSpatialState(flights: SimulatedFlight[], clockMin: number): FlightSpatialState {
  const holdingBuckets = new Map<string, SimulatedFlight[]>();
  const groundHeldCounts = new Map<string, number>();
  const airborneFlights: AirborneFlightItem[] = [];

  for (const f of flights) {
    if (f.status === "CANCELLED" || f.status === "CREW_BREACH") continue;
    if (f.primaryReason === "PRIMARY_WEATHER_DEP_HOLD" && clockMin >= f.scheduledDepMin && clockMin < f.actualDepMin) {
      groundHeldCounts.set(f.origin, (groundHeldCounts.get(f.origin) ?? 0) + 1);
    }
    if (clockMin < f.actualDepMin || clockMin > f.actualArrMin) continue;

    const isHolding = f.holdingStartMin !== null && clockMin >= f.holdingStartMin && clockMin < (f.holdingEndMin ?? f.actualArrMin);
    if (isHolding) {
      const bucket = holdingBuckets.get(f.destination);
      if (bucket) bucket.push(f);
      else holdingBuckets.set(f.destination, [f]);
      continue;
    }

    const fromPt = getAirportPoint(f.origin);
    const toPt = getAirportPoint(f.destination);
    if (!fromPt || !toPt) continue;
    const progress = (clockMin - f.actualDepMin) / Math.max(1, (f.holdingStartMin ?? f.actualArrMin) - f.actualDepMin);
    airborneFlights.push({ flight: f, ...interpolateFlightPosition(fromPt, toPt, progress), isHolding: false });
  }

  for (const [airportId, holdingList] of holdingBuckets.entries()) {
    const center = getAirportPoint(airportId);
    if (!center) continue;
    holdingList.forEach((flight, idx) => {
      airborneFlights.push({ flight, ...holdingOrbitPosition(center, clockMin, idx), isHolding: true });
    });
  }

  return { holdingBuckets, groundHeldCounts, airborneFlights };
}

function getFragilityColor(score: number): string {
  if (score >= 65) return "#DC2626";
  if (score >= 32) return "#D97706";
  return "#2B79FB";
}

function getAircraftColor(flight: SimulatedFlight, isHolding: boolean): string {
  if (isHolding) return "#DC2626";
  if (flight.isSpareOperated) return "#047857";
  if (flight.delayMin > 0) return "#D97706";
  return "#2B79FB";
}

function getCalloutOffset(flight: SimulatedFlight, x: number, y: number, isHolding: boolean) {
  if (!isHolding) return { x: 10, y: -10 };
  const hubCenter = getAirportPoint(flight.destination);
  if (!hubCenter) return { x: 10, y: -10 };
  // Radially offset holding callout away from hub center to prevent sibling overlap.
  const dx = x - hubCenter.x;
  const dy = y - hubCenter.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  return { x: ux >= 0 ? ux * 14 : ux * 14 - 72, y: (dy / len) * 16 };
}

/** Renders interactive 16-airport beacons and live airborne aircraft on the radar SVG. */
export const RadarEntities = memo(function RadarEntities(props: RadarEntitiesProps) {
  const {
    airborneFlights, closuresByAirport, fragilityByAirport, airportStatusMap, sparesUsed,
    selectedFlightId, selectedTailId, selectedAirportId, hoveredFlightId, dragOverAirport,
    isStormDragging, showFragilityOverlay, cameraScale, invScale,
    onSelectFlight, onSelectAirport, onFocusAirport, onDropStormOnAirport,
    onDragOverAirportChange, onHoverFlightChange,
  } = props;

  return (
    <>
      {DATASET.airports.map((airport: Airport) => {
        const pt = getAirportPoint(airport.id);
        if (!pt) return null;
        const labelCfg = AIRPORT_LABEL_OFFSETS[airport.id] ?? { dx: 12, dy: 4, anchor: "start" };
        const closure = closuresByAirport.get(airport.id);
        const st = airportStatusMap.get(airport.id);
        const hasAlert = Boolean(closure || st?.hasBreach);
        const beaconColor = hasAlert ? "#DC2626" : st?.hasDelay ? "#D97706" : "#2B79FB";
        const frag = fragilityByAirport.get(airport.id);
        const fragColor = frag ? getFragilityColor(frag.fragilityScore) : "#2B79FB";
        const isDragHover = dragOverAirport === airport.id;
        const baseSpare = DATASET.spare_aircraft.find((s) => s.base === airport.id);
        const spareUsed = baseSpare ? sparesUsed.has(baseSpare.tail_id) : false;
        const spareOffset = SPARE_BADGE_OFFSETS[airport.id];
        const radius = airport.tier === "mega_hub" ? 5.5 : airport.tier === "regional_hub" ? 4.4 : 3.4;

        return (
          <g
            key={airport.id}
            transform={`translate(${pt.x}, ${pt.y}) scale(${invScale})`}
            {...svgButtonProps(`${airport.id} ${airport.city} airport${closure ? ", closed" : ""}. Click to configure closure.`, () =>
              onSelectAirport(airport.id)
            )}
            onDoubleClick={(e) => {
              e.stopPropagation();
              onFocusAirport(airport.id, 2.8);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              if (dragOverAirport !== airport.id) onDragOverAirportChange(airport.id);
            }}
            onDragLeave={() => {
              if (dragOverAirport === airport.id) onDragOverAirportChange(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDragOverAirportChange(null);
              onDropStormOnAirport(airport.id);
            }}
          >
            <circle r={20} fill="transparent" />
            {showFragilityOverlay && frag && (
              <circle r={12 + (frag.fragilityScore / 100) * 14} fill={fragColor} fillOpacity={0.14} stroke={fragColor} strokeOpacity={0.5} strokeWidth={1} />
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
            {selectedAirportId === airport.id && <circle r={13} fill="none" stroke="#2B79FB" strokeWidth={1.8} />}
            <circle r={radius} fill={beaconColor} stroke="#FFFFFF" strokeWidth={1.8} />
            <text
              x={labelCfg.dx}
              y={labelCfg.dy}
              textAnchor={labelCfg.anchor}
              fontSize={airport.tier === "mega_hub" ? "11.5" : "10"}
              fontFamily="var(--font-mono)"
              fontWeight={airport.tier === "mega_hub" ? "700" : "600"}
              fill={hasAlert ? "#B91C1C" : "#0F172A"}
            >
              {airport.id}
            </text>
            {baseSpare && spareOffset && cameraScale >= 1.25 && (
              <g transform={`translate(${spareOffset.dx}, ${spareOffset.dy})`}>
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
                  {spareUsed ? `${baseSpare.tail_id.slice(-4)} ACTIVE` : `SPARE ${baseSpare.tail_id.slice(-4)}`}
                </text>
              </g>
            )}
          </g>
        );
      })}

      {airborneFlights.map(({ flight, x, y, angleDeg, isHolding }) => {
        const isSelected = flight.flight_id === selectedFlightId || flight.tail_id === selectedTailId;
        const isHovered = flight.flight_id === hoveredFlightId;
        const color = getAircraftColor(flight, isHolding);
        const showCallout = isHolding
          ? cameraScale >= 1.6 || isSelected || isHovered
          : isSelected || isHovered || (cameraScale >= 1.85 && flight.delayMin > 0);
        const callout = getCalloutOffset(flight, x, y, isHolding);
        const statusDesc = isHolding ? "holding" : flight.delayMin > 0 ? `delayed ${flight.delayMin} minutes` : "on time";

        return (
          <g
            key={`plane-${flight.flight_id}`}
            transform={`translate(${x}, ${y}) scale(${invScale})`}
            {...svgButtonProps(`Flight ${flight.flight_id} (${flight.origin} to ${flight.destination}), ${statusDesc}`, () =>
              onSelectFlight(flight.flight_id)
            )}
            onMouseEnter={() => onHoverFlightChange(flight.flight_id)}
            onMouseLeave={() => onHoverFlightChange(null)}
          >
            <circle r={12} fill="transparent" />
            {isSelected && <circle r={11} fill="none" stroke="#2B79FB" strokeWidth={1.6} strokeDasharray="3 2" />}
            <g transform={`rotate(${angleDeg})`}>
              <path d={AIRCRAFT_GLYPH_PATH} fill={color} stroke="#FFFFFF" strokeWidth={1} />
            </g>
            {showCallout && (
              <g transform={`translate(${callout.x}, ${callout.y})`}>
                <rect x={0} y={-8} width={isHolding ? 72 : 66} height={15} rx={3} fill="#FFFFFF" stroke={color} strokeWidth={1} />
                <text x={4} y={2.5} fontSize="8.5" fill={isHolding ? "#B91C1C" : "#0F172A"} {...MONO_BOLD_STYLE}>
                  {flight.flight_id}
                  {isHolding ? " HOLD" : flight.delayMin > 0 ? ` +${flight.delayMin}m` : ""}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </>
  );
});
