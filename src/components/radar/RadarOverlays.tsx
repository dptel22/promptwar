/**
 * Memoized SVG vector overlay layers for the India radar map: static route web, flight arcs,
 * recovery ghost diff previews, selected-tail domino chains, storm cells, and holding orbits.
 */

import { memo, useMemo, type KeyboardEvent, type MouseEvent } from "react";
import { UNIQUE_ROUTES, buildArcPath, getAirportPoint, interpolateFlightPosition } from "@/lib/geo";
import { formatHHMM } from "@/lib/sim/constants";
import type { AirportClosure, FlightStatus, RecoveryCandidate, SimulatedFlight } from "@/lib/sim/types";

/** Shared monospace bold styling for crisp SVG radar callouts. */
export const MONO_BOLD_STYLE = { fontFamily: "var(--font-mono)", fontWeight: 700 } as const;

/** Props for {@link RadarOverlays}. */
export interface RadarOverlaysProps {
  flights: SimulatedFlight[];
  closures: AirportClosure[];
  previewCandidate: RecoveryCandidate | null;
  selectedTailFlights: SimulatedFlight[];
  selectedTailId: string | null;
  holdingBuckets: ReadonlyMap<string, SimulatedFlight[]>;
  groundHeldCounts: ReadonlyMap<string, number>;
  routeFilter: "cascade" | "all";
  clockMin: number;
  cameraScale: number;
  invScale: number;
  onSelectFlight: (flightId: string) => void;
  onRemoveClosure: (airportId: string) => void;
  onFocusAirport: (airportId: string, targetScale?: number) => void;
}

/** Activates an interactive SVG `<g role="button">` element on `Enter` or `Space`. */
export function handleSvgKeyActivate(e: KeyboardEvent, callback: () => void): void {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    e.stopPropagation();
    callback();
  }
}

/** Builds consistent pointer and keyboard accessibility props for SVG button groups. */
export function svgButtonProps(ariaLabel: string, onActivate: () => void) {
  return {
    "data-interactive": "true",
    role: "button" as const,
    tabIndex: 0,
    "aria-label": ariaLabel,
    className: "cursor-pointer focus-visible:outline-2 focus-visible:outline-[#2B79FB]",
    onClick: (e: MouseEvent) => {
      e.stopPropagation();
      onActivate();
    },
    onKeyDown: (e: KeyboardEvent) => handleSvgKeyActivate(e, onActivate),
  };
}

function getFlightStatusColor(status: FlightStatus): string {
  if (status === "CREW_BREACH") return "#DC2626";
  if (status === "CANCELLED") return "#94A3B8";
  if (status === "DELAYED") return "#D97706";
  return "#2B79FB";
}

function getPreviewDiffLabel(beforeF: SimulatedFlight, afterF: SimulatedFlight): string {
  if (afterF.status === "CANCELLED") return "CANCEL";
  if (afterF.isSpareOperated && !beforeF.isSpareOperated) return afterF.activeTailId.slice(-4);
  if (afterF.delayMin < beforeF.delayMin) return `-${beforeF.delayMin - afterF.delayMin}m`;
  return `+${afterF.delayMin}m`;
}

/** Renders static route web, flight arcs, recovery ghost diffs, domino chains, storms, and holding orbits. */
export const RadarOverlays = memo(function RadarOverlays(props: RadarOverlaysProps) {
  const {
    flights, closures, previewCandidate, selectedTailFlights, selectedTailId,
    holdingBuckets, groundHeldCounts, routeFilter, clockMin, cameraScale, invScale,
    onSelectFlight, onRemoveClosure, onFocusAirport,
  } = props;

  const previewDiffs = useMemo(() => {
    if (!previewCandidate) return [];
    return flights.flatMap((beforeF) => {
      const afterF = previewCandidate.result.flightsById[beforeF.flight_id];
      const changed =
        afterF &&
        (beforeF.status !== afterF.status ||
          beforeF.actualDepMin !== afterF.actualDepMin ||
          beforeF.actualArrMin !== afterF.actualArrMin ||
          beforeF.activeTailId !== afterF.activeTailId);
      return changed ? [{ beforeF, afterF }] : [];
    });
  }, [flights, previewCandidate]);

  return (
    <>
      <g aria-hidden="true">
        {UNIQUE_ROUTES.map(({ key, from, to }) => {
          const fromPt = getAirportPoint(from);
          const toPt = getAirportPoint(to);
          if (!fromPt || !toPt) return null;
          const opacity = selectedTailId ? 0.22 : routeFilter === "all" ? 0.65 : 0.28;
          return (
            <path key={key} d={buildArcPath(fromPt, toPt)} fill="none" stroke="#9EAFD8" strokeOpacity={opacity} strokeWidth={invScale} />
          );
        })}
      </g>

      <g aria-hidden="true">
        {flights.map((f) => {
          const isAirborne = clockMin >= f.actualDepMin && clockMin <= f.actualArrMin;
          if (routeFilter !== "all" && f.status === "ON_TIME" && !isAirborne) return null;
          const fromPt = getAirportPoint(f.origin);
          const toPt = getAirportPoint(f.destination);
          if (!fromPt || !toPt) return null;
          const opacity = selectedTailId ? (f.tail_id === selectedTailId ? 0.9 : 0.1) : f.status !== "ON_TIME" ? 0.7 : 0.42;
          return (
            <path
              key={`arc-${f.flight_id}`}
              d={buildArcPath(fromPt, toPt)}
              fill="none"
              stroke={getFlightStatusColor(f.status)}
              strokeOpacity={opacity}
              strokeWidth={(f.status !== "ON_TIME" ? 1.8 : 1.2) * invScale}
            />
          );
        })}
      </g>

      {previewDiffs.length > 0 && (
        <g aria-label="Recovery preview before and after overlay">
          {previewDiffs.map(({ beforeF, afterF }) => {
            const fromPt = getAirportPoint(beforeF.origin);
            const toPt = getAirportPoint(beforeF.destination);
            if (!fromPt || !toPt) return null;
            const pathD = buildArcPath(fromPt, toPt);
            const mid = interpolateFlightPosition(fromPt, toPt, 0.5);
            const diffColor = afterF.status === "CANCELLED" ? "#B91C1C" : "#047857";
            return (
              <g key={`ghost-${beforeF.flight_id}`}>
                <path d={pathD} fill="none" stroke="#94A3B8" strokeWidth={2 * invScale} strokeDasharray={`${5 * invScale} ${4 * invScale}`} />
                <path d={pathD} fill="none" stroke={diffColor} strokeWidth={2.6 * invScale} />
                <g transform={`translate(${mid.x}, ${mid.y}) scale(${invScale})`}>
                  <rect x={-28} y={-9} width={56} height={18} rx={4} fill="#FFFFFF" stroke={diffColor} strokeWidth={1.2} />
                  <text x={0} y={3.5} textAnchor="middle" fontSize="9" fill={diffColor} {...MONO_BOLD_STYLE}>
                    {getPreviewDiffLabel(beforeF, afterF)}
                  </text>
                </g>
              </g>
            );
          })}
        </g>
      )}

      {selectedTailFlights.length > 0 && (
        <g aria-label={`Selected domino chain for ${selectedTailId}`}>
          {selectedTailFlights.map((f) => {
            const fromPt = getAirportPoint(f.origin);
            const toPt = getAirportPoint(f.destination);
            if (!fromPt || !toPt) return null;
            const mid = interpolateFlightPosition(fromPt, toPt, 0.48);
            const strokeColor = getFlightStatusColor(f.status);
            const dash = f.status === "CANCELLED" ? `${4 * invScale} ${4 * invScale}` : `${7 * invScale} ${5 * invScale}`;
            return (
              <g key={`chain-${f.flight_id}`}>
                <path
                  d={buildArcPath(fromPt, toPt)}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={2.6 * invScale}
                  strokeDasharray={dash}
                  className={f.status === "CANCELLED" ? undefined : "domino-arc-flow"}
                />
                <g
                  transform={`translate(${mid.x}, ${mid.y}) scale(${invScale})`}
                  {...svgButtonProps(`Select leg ${f.leg_order} flight ${f.flight_id} (${f.origin} to ${f.destination})`, () =>
                    onSelectFlight(f.flight_id)
                  )}
                >
                  <circle r={10} fill="#FFFFFF" stroke={strokeColor} strokeWidth={1.8} />
                  <text x={0} y={3.5} textAnchor="middle" fontSize="9.5" fill="#0F172A" {...MONO_BOLD_STYLE}>
                    {f.leg_order}
                  </text>
                </g>
              </g>
            );
          })}
        </g>
      )}

      {closures.map((closure) => {
        const pt = getAirportPoint(closure.airportId);
        if (!pt) return null;
        const isActiveNow = clockMin >= closure.startMin && clockMin < closure.endMin;
        const heldCount = groundHeldCounts.get(closure.airportId) ?? 0;
        return (
          <g key={`storm-${closure.id}`}>
            <circle cx={pt.x} cy={pt.y} r={40 * invScale} fill="#DC2626" fillOpacity={isActiveNow ? 0.12 : 0.05} />
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
            <g data-interactive="true" transform={`translate(${pt.x + 14 * invScale}, ${pt.y - 26 * invScale}) scale(${invScale})`}>
              <rect x={0} y={-11} width={126} height={21} rx={4} fill="#FFFFFF" stroke="#DC2626" strokeWidth={1.2} />
              <text x={7} y={3} fontSize="9.5" fill="#B91C1C" {...MONO_BOLD_STYLE}>
                {closure.airportId} {formatHHMM(closure.startMin)}–{formatHHMM(closure.endMin)}
              </text>
              <g
                transform="translate(114, -1)"
                {...svgButtonProps(`Remove storm closure at ${closure.airportId}`, () => onRemoveClosure(closure.airportId))}
              >
                <circle r={6.5} fill="#FEE2E2" />
                <text x={0} y={3} textAnchor="middle" fontSize="9.5" fill="#B91C1C" {...MONO_BOLD_STYLE}>×</text>
              </g>
            </g>
            {heldCount > 0 && (
              <g transform={`translate(${pt.x + 14 * invScale}, ${pt.y - 4 * invScale}) scale(${invScale})`}>
                <rect x={0} y={0} width={60} height={16} rx={3} fill="#FEF3C7" stroke="#D97706" strokeWidth={0.9} />
                <text x={30} y={11} textAnchor="middle" fontSize="8.5" fill="#B45309" {...MONO_BOLD_STYLE}>{heldCount} HELD</text>
              </g>
            )}
          </g>
        );
      })}

      {Array.from(holdingBuckets.entries()).map(([airportId, holdingList]) => {
        const center = getAirportPoint(airportId);
        if (!center) return null;
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
            {cameraScale < 1.6 && holdingList.length > 0 && (
              <g
                transform={`translate(${center.x - 54 * invScale}, ${center.y + 28 * invScale}) scale(${invScale})`}
                {...svgButtonProps(`${holdingList.length} flights holding at ${airportId}. Zoom in to inspect.`, () =>
                  onFocusAirport(airportId, 2.4)
                )}
              >
                <rect x={-34} y={-9} width={74} height={18} rx={9} fill="#FEE2E2" stroke="#DC2626" strokeWidth={1.1} />
                <text x={3} y={3} textAnchor="middle" fontSize="8.5" fill="#B91C1C" {...MONO_BOLD_STYLE}>
                  {holdingList.length} HOLDING
                </text>
              </g>
            )}
          </g>
        );
      })}
    </>
  );
});
