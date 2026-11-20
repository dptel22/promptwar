export interface Point {
  x: number;
  y: number;
}

export const MAP_VIEWBOX = {
  width: 1000,
  height: 860,
} as const;

// Bounds tuned for India (67.0E..98.5E, 5.5N..37.2N) with cos(22 deg) aspect correction
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

export function projectLatLng(lat: number, lng: number): Point {
  const x = OFFSET_X + (lng - LNG_MIN) * COS_MID_LAT * SCALE;
  const y = OFFSET_Y + (LAT_MAX - lat) * SCALE;
  return { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 };
}

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
  // Deterministic curve perpendicular to leg direction (consistent curvature for bidirectional pairs)
  const curveOffset = Math.min(48, Math.max(12, dist * 0.14));
  return {
    x: mx - (dy / dist) * curveOffset,
    y: my + (dx / dist) * curveOffset,
  };
}

export function buildArcPath(from: Point, to: Point): string {
  const ctrl = getArcControlPoint(from, to);
  return `M${from.x},${from.y} Q${ctrl.x.toFixed(1)},${ctrl.y.toFixed(1)} ${to.x},${to.y}`;
}

export function interpolateFlightPosition(
  from: Point,
  to: Point,
  progress: number
): { x: number; y: number; angleDeg: number } {
  const t = Math.max(0, Math.min(1, progress));
  const ctrl = getArcControlPoint(from, to);
  const omt = 1 - t;

  const x = omt * omt * from.x + 2 * omt * t * ctrl.x + t * t * to.x;
  const y = omt * omt * from.y + 2 * omt * t * ctrl.y + t * t * to.y;

  // Derivative of quadratic Bezier for exact aircraft nose heading
  const tx = 2 * omt * (ctrl.x - from.x) + 2 * t * (to.x - ctrl.x);
  const ty = 2 * omt * (ctrl.y - from.y) + 2 * t * (to.y - ctrl.y);
  const angleDeg = (Math.atan2(ty, tx) * 180) / Math.PI;

  return { x, y, angleDeg };
}

export function holdingOrbitPosition(
  center: Point,
  clockMin: number,
  slotIndex: number
): { x: number; y: number; angleDeg: number } {
  const radiusX = 24 + (slotIndex % 2) * 8;
  const radiusY = 14 + (slotIndex % 2) * 5;
  // ~1 orbit every 12 simulated minutes
  const theta = ((clockMin * 0.52 + slotIndex * 1.7) % (Math.PI * 2));
  const x = center.x + Math.cos(theta) * radiusX;
  const y = center.y + Math.sin(theta) * radiusY;
  const tx = -Math.sin(theta) * radiusX;
  const ty = Math.cos(theta) * radiusY;
  const angleDeg = (Math.atan2(ty, tx) * 180) / Math.PI;
  return { x, y, angleDeg };
}
