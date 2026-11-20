/**
 * Deterministic SVG projection, circular dial geometry, and Indian flight-arc
 * math shared by both the kinetic landing chronograph and the OCC radar map.
 */

import rawDataset from "../data/domino-sky-dataset.json";
import type { DominoDataset } from "./sim/types";

/** Two-dimensional SVG viewBox coordinate. */
export interface Point {
  x: number;
  y: number;
}

/** Logical SVG coordinate space framing the Indian landmass and airspace. */
export const MAP_VIEWBOX = {
  width: 1000,
  height: 860,
} as const;

/** Shared aircraft silhouette vector oriented nose-right along `+X`. */
export const AIRCRAFT_GLYPH_PATH =
  "M8.5 0 L2.5 1.8 L-2.5 7.5 L-4.5 7.5 L-1.8 1.8 L-6.2 1.2 L-8 3.6 L-9.4 3.6 L-8.4 0 L-9.4 -3.6 L-8 -3.6 L-6.2 -1.2 L-1.8 -1.8 L-4.5 -7.5 L-2.5 -7.5 L2.5 -1.8 Z";

// Bounds tuned for India (66.8E..98.4E, 5.4N..37.4N) with cos(22 deg) aspect ratio.
const LNG_MIN = 66.8;
const LNG_MAX = 98.4;
const LAT_MIN = 5.4;
const LAT_MAX = 37.4;
const COS_MID_LAT = Math.cos((22 * Math.PI) / 180);

const RAW_WIDTH = (LNG_MAX - LNG_MIN) * COS_MID_LAT;
const RAW_HEIGHT = LAT_MAX - LAT_MIN;
const SCALE = Math.min(
  (MAP_VIEWBOX.width - 80) / RAW_WIDTH,
  (MAP_VIEWBOX.height - 60) / RAW_HEIGHT
);

const OFFSET_X = (MAP_VIEWBOX.width - RAW_WIDTH * SCALE) / 2;
const OFFSET_Y = (MAP_VIEWBOX.height - RAW_HEIGHT * SCALE) / 2;

const GEO_DATASET = rawDataset as DominoDataset;

/**
 * Rounds a number to 2 decimal places so SSR and client SVG strings match bit-for-bit.
 *
 * @param n - Floating-point input value.
 * @returns Rounded number with at most two fractional digits.
 */
export function round2(n: number): number {
  const rounded = Math.round(n * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * Converts polar angle/radius into Cartesian SVG coordinates (0 deg = 12 o'clock).
 *
 * @param cx - Circle center X.
 * @param cy - Circle center Y.
 * @param r - Circle radius.
 * @param angleDeg - Clockwise angle in degrees starting from top dead center.
 * @returns Pre-rounded `{ x, y }` SVG coordinate.
 */
export function polarToCartesian(
  cx: number,
  cy: number,
  r: number,
  angleDeg: number
): Point {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: round2(cx + r * Math.cos(rad)),
    y: round2(cy + r * Math.sin(rad)),
  };
}

/**
 * Builds an SVG circular arc path command between two clockwise angles.
 *
 * @param cx - Circle center X.
 * @param cy - Circle center Y.
 * @param r - Circle radius.
 * @param startAngle - Start angle in degrees.
 * @param endAngle - End angle in degrees.
 * @returns SVG `d` path string.
 */
export function describeArc(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number
): string {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
}

/**
 * Projects geographic WGS84 coordinates onto the India map SVG viewBox.
 *
 * @param lat - Latitude in decimal degrees.
 * @param lng - Longitude in decimal degrees.
 * @returns Projected 2-decimal SVG point.
 */
export function projectLatLng(lat: number, lng: number): Point {
  const x = OFFSET_X + (lng - LNG_MIN) * COS_MID_LAT * SCALE;
  const y = OFFSET_Y + (LAT_MAX - lat) * SCALE;
  return { x: round2(x), y: round2(y) };
}

/** Precomputed map coordinates keyed by 3-letter IATA airport code. */
export const AIRPORT_POINTS: ReadonlyMap<string, Point> = new Map(
  GEO_DATASET.airports.map((a) => [a.id, projectLatLng(a.lat, a.lng)])
);

/** Undirected unique airport-pair corridors present in the 70-flight schedule. */
export const UNIQUE_ROUTES: ReadonlyArray<{
  key: string;
  from: string;
  to: string;
}> = (() => {
  const seen = new Set<string>();
  const out: Array<{ key: string; from: string; to: string }> = [];
  for (const f of GEO_DATASET.flights) {
    const pair = [f.origin, f.destination].sort().join("-");
    if (seen.has(pair)) continue;
    seen.add(pair);
    out.push({ key: pair, from: f.origin, to: f.destination });
  }
  return out;
})();

/**
 * Safely returns the projected SVG point for an airport IATA code.
 *
 * @param airportId - Three-letter IATA identifier.
 * @returns Projected `Point` or `undefined` if unknown.
 */
export function getAirportPoint(airportId: string): Point | undefined {
  return AIRPORT_POINTS.get(airportId);
}

/**
 * Converts a GeoJSON polygon coordinate ring into a closed SVG path string.
 *
 * @param ring - Array of `[lng, lat]` vertices.
 * @returns SVG `M ... L ... Z` path string.
 */
export function geoRingToSvgPath(ring: number[][]): string {
  if (ring.length === 0) return "";
  return (
    ring
      .map(([lng, lat], idx) => {
        const pt = projectLatLng(lat, lng);
        return `${idx === 0 ? "M" : "L"}${pt.x},${pt.y}`;
      })
      .join(" ") + " Z"
  );
}

/** Non-colliding label anchor offsets for all 16 Indian airports. */
export const AIRPORT_LABEL_OFFSETS: Record<
  string,
  { dx: number; dy: number; anchor: "start" | "middle" | "end" }
> = {
  DEL: { dx: -14, dy: -6, anchor: "end" },
  IXC: { dx: 0, dy: -13, anchor: "middle" },
  JAI: { dx: -12, dy: 12, anchor: "end" },
  LKO: { dx: 12, dy: -4, anchor: "start" },
  AMD: { dx: -13, dy: -4, anchor: "end" },
  BOM: { dx: -15, dy: -4, anchor: "end" },
  PNQ: { dx: 12, dy: 8, anchor: "start" },
  GOI: { dx: -12, dy: 4, anchor: "end" },
  HYD: { dx: 14, dy: -6, anchor: "start" },
  BLR: { dx: -14, dy: -6, anchor: "end" },
  MAA: { dx: 14, dy: 4, anchor: "start" },
  COK: { dx: -12, dy: -2, anchor: "end" },
  TRV: { dx: 12, dy: 8, anchor: "start" },
  BBI: { dx: 12, dy: 6, anchor: "start" },
  CCU: { dx: 13, dy: -6, anchor: "start" },
  GAU: { dx: 0, dy: -14, anchor: "middle" },
};

/** Reserve spare aircraft badge anchor offsets (`BLR` / `DEL`). */
export const SPARE_BADGE_OFFSETS: Record<string, { dx: number; dy: number }> = {
  BLR: { dx: -14, dy: 18 },
  DEL: { dx: 14, dy: -16 },
};

function getArcControlPoint(from: Point, to: Point): Point {
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy) || 1;
  // Orthogonal curvature separates outbound vs inbound legs on bidirectional hubs.
  const curveOffset = Math.min(48, Math.max(12, dist * 0.14));
  return {
    x: mx - (dy / dist) * curveOffset,
    y: my + (dx / dist) * curveOffset,
  };
}

/**
 * Generates a curved quadratic Bezier SVG path between two airport coordinates.
 *
 * @param from - Departure airport SVG point.
 * @param to - Arrival airport SVG point.
 * @returns SVG `M ... Q ...` path string.
 */
export function buildArcPath(from: Point, to: Point): string {
  const ctrl = getArcControlPoint(from, to);
  return `M${from.x},${from.y} Q${ctrl.x.toFixed(1)},${ctrl.y.toFixed(1)} ${to.x},${to.y}`;
}

/**
 * Evaluates live position and heading angle along a curved Bezier route leg.
 *
 * @param from - Origin point.
 * @param to - Destination point.
 * @param progress - Normalized flight completion in `[0, 1]`.
 * @returns ViewBox coordinates and tangent heading in degrees.
 */
export function interpolateFlightPosition(
  from: Point,
  to: Point,
  progress: number
): { x: number; y: number; angleDeg: number } {
  const t = Math.max(0, Math.min(1, progress));
  const ctrl = getArcControlPoint(from, to);
  const omt = 1 - t;

  const x = round2(omt * omt * from.x + 2 * omt * t * ctrl.x + t * t * to.x);
  const y = round2(omt * omt * from.y + 2 * omt * t * ctrl.y + t * t * to.y);

  // Tangent derivative of quadratic Bezier gives exact aircraft nose orientation.
  const tx = 2 * omt * (ctrl.x - from.x) + 2 * t * (to.x - ctrl.x);
  const ty = 2 * omt * (ctrl.y - from.y) + 2 * t * (to.y - ctrl.y);
  const angleDeg = round2((Math.atan2(ty, tx) * 180) / Math.PI);

  return { x, y, angleDeg };
}

/**
 * Computes an elliptical ATC airborne holding-orbit coordinate and heading.
 *
 * @param center - Closed destination hub SVG coordinate.
 * @param clockMin - Current simulation clock in minutes.
 * @param slotIndex - Aircraft holding stack index separating concentric tracks.
 * @returns Holding orbit coordinates and tangential aircraft heading.
 */
export function holdingOrbitPosition(
  center: Point,
  clockMin: number,
  slotIndex: number
): { x: number; y: number; angleDeg: number } {
  const radiusX = 24 + (slotIndex % 2) * 8;
  const radiusY = 14 + (slotIndex % 2) * 5;
  // Complete roughly one full holding pattern every 12 simulated minutes.
  const theta = (clockMin * 0.52 + slotIndex * 1.7) % (Math.PI * 2);
  const x = round2(center.x + Math.cos(theta) * radiusX);
  const y = round2(center.y + Math.sin(theta) * radiusY);
  const tx = -Math.sin(theta) * radiusX;
  const ty = Math.cos(theta) * radiusY;
  const angleDeg = round2((Math.atan2(ty, tx) * 180) / Math.PI);
  return { x, y, angleDeg };
}
