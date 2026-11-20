/**
 * Pure camera state and viewport projection math for the interactive India radar SVG.
 *
 * Maps browser client pointer coordinates onto the SVG `viewBox` through
 * `preserveAspectRatio="xMidYMid meet"` letterboxing:
 * - Uniform scale `s = min(rect.width / viewBox.width, rect.height / viewBox.height)`
 * - Centered letterbox offsets `offsetX = (rect.width - viewBox.width * s) / 2`,
 *   `offsetY = (rect.height - viewBox.height * s) / 2`
 * - ViewBox point `vx = (clientX - rect.left - offsetX) / s`,
 *   `vy = (clientY - rect.top - offsetY) / s`
 *
 * The SVG group transform `translate(cx + tx, cy + ty) scale(scale) translate(-cx, -cy)`
 * maps a world viewBox coordinate `w` to `v = c + t + scale * (w - c)`.
 */

import { MAP_VIEWBOX, type Point } from "@/lib/geo";

/** Camera pan and zoom transform parameters in SVG viewBox space. */
export interface CameraState {
  scale: number;
  tx: number;
  ty: number;
}

/** Bounding client rectangle describing the rendered radar container. */
export interface ViewportRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Minimum zoom scale factor allowed on the radar canvas. */
export const MIN_CAMERA_SCALE = 0.95;

/** Maximum zoom scale factor allowed on the radar canvas. */
export const MAX_CAMERA_SCALE = 4.5;

/** Default India-wide camera framing at initial load and reset. */
export const DEFAULT_CAMERA: CameraState = {
  scale: 1.04,
  tx: 0,
  ty: 0,
};

const VIEWBOX_CX = MAP_VIEWBOX.width / 2;
const VIEWBOX_CY = MAP_VIEWBOX.height / 2;
const WHEEL_ZOOM_STEP = 1.18;

function roundScale(value: number): number {
  const rounded = Math.round(value * 100) / 100;
  return rounded === 0 ? 0 : rounded;
}

function roundOffset(value: number): number {
  const rounded = Math.round(value * 10) / 10;
  return rounded === 0 ? 0 : rounded;
}

function getMeetViewport(rect?: ViewportRect | null) {
  if (!rect || rect.width <= 0 || rect.height <= 0) {
    return { scaleFactor: 1, offsetX: 0, offsetY: 0, left: 0, top: 0 };
  }
  const scaleFactor =
    Math.min(rect.width / MAP_VIEWBOX.width, rect.height / MAP_VIEWBOX.height) || 1;
  const offsetX = (rect.width - MAP_VIEWBOX.width * scaleFactor) / 2;
  const offsetY = (rect.height - MAP_VIEWBOX.height * scaleFactor) / 2;
  return { scaleFactor, offsetX, offsetY, left: rect.left, top: rect.top };
}

/**
 * Clamps zoom scale to `[0.95, 4.5]` and bounds pan translation to 55% of the
 * scaled viewBox extent so the Indian landmass cannot be dragged completely off-screen.
 *
 * @param scale - Desired zoom multiplier.
 * @param tx - Desired horizontal translation in viewBox units.
 * @param ty - Desired vertical translation in viewBox units.
 * @returns Sanitized and deterministically rounded `CameraState`.
 */
export function clampCamera(scale: number, tx: number, ty: number): CameraState {
  const clampedScale = roundScale(
    Math.max(MIN_CAMERA_SCALE, Math.min(MAX_CAMERA_SCALE, scale))
  );
  const maxTx = MAP_VIEWBOX.width * clampedScale * 0.55;
  const maxTy = MAP_VIEWBOX.height * clampedScale * 0.55;
  return {
    scale: clampedScale,
    tx: roundOffset(Math.max(-maxTx, Math.min(maxTx, tx))),
    ty: roundOffset(Math.max(-maxTy, Math.min(maxTy, ty))),
  };
}

/**
 * Computes a dampened inverse scale factor (`1 / scale^0.72`) so airport beacons,
 * route strokes, and text labels stay legible across zoom levels without over-shrinking.
 *
 * @param scale - Current camera zoom scale.
 * @returns Rounded inverse multiplier rounded to 3 decimal places.
 */
export function getInvScale(scale: number): number {
  const safeScale = Math.max(0.01, scale);
  return Math.round((1 / Math.pow(safeScale, 0.72)) * 1000) / 1000;
}

/**
 * Centers the radar camera on a specific SVG viewBox coordinate at `targetScale`.
 *
 * @param point - Target viewBox coordinate to place at the viewport center.
 * @param targetScale - Desired zoom scale (clamped to `[0.95, 4.5]`).
 * @returns Clamped `CameraState` centered on `point`.
 */
export function focusPoint(point: Point, targetScale = 2.6): CameraState {
  const clampedScale = roundScale(
    Math.max(MIN_CAMERA_SCALE, Math.min(MAX_CAMERA_SCALE, targetScale))
  );
  return clampCamera(
    clampedScale,
    (VIEWBOX_CX - point.x) * clampedScale,
    (VIEWBOX_CY - point.y) * clampedScale
  );
}

/**
 * Scales the camera around the center of the SVG viewBox while preserving the
 * world coordinate currently pinned at the viewport center.
 *
 * @param prev - Prior camera state.
 * @param multiplier - Multiplicative zoom step (e.g. `1.3` or `1 / 1.3`).
 * @returns Updated clamped `CameraState`.
 */
export function zoomAroundCenter(
  prev: CameraState,
  multiplier: number
): CameraState {
  const safePrevScale = prev.scale > 0 ? prev.scale : MIN_CAMERA_SCALE;
  const nextScale = roundScale(
    Math.max(MIN_CAMERA_SCALE, Math.min(MAX_CAMERA_SCALE, safePrevScale * multiplier))
  );
  const ratio = nextScale / safePrevScale;
  return clampCamera(nextScale, prev.tx * ratio, prev.ty * ratio);
}

/**
 * Zooms the radar camera around the pointer position so the geographic location
 * beneath the cursor remains stationary across letterboxed `xMidYMid meet` viewports.
 *
 * @param prev - Prior camera state.
 * @param rect - Current bounding rectangle of the radar container.
 * @param clientX - Pointer X coordinate in browser client space.
 * @param clientY - Pointer Y coordinate in browser client space.
 * @param deltaY - Wheel vertical delta (`0` is a strict no-op).
 * @returns Updated `CameraState` (or `prev` unchanged when `deltaY === 0`).
 */
export function zoomAtClientPoint(
  prev: CameraState,
  rect: ViewportRect,
  clientX: number,
  clientY: number,
  deltaY: number
): CameraState {
  if (deltaY === 0) return prev;

  const { scaleFactor, offsetX, offsetY, left, top } = getMeetViewport(rect);
  const vx = (clientX - left - offsetX) / scaleFactor;
  const vy = (clientY - top - offsetY) / scaleFactor;
  const factor = deltaY < 0 ? WHEEL_ZOOM_STEP : 1 / WHEEL_ZOOM_STEP;

  const safePrevScale = prev.scale > 0 ? prev.scale : MIN_CAMERA_SCALE;
  // Round target scale before deriving ratio so the pivot invariant holds after clamping.
  const nextScale = roundScale(
    Math.max(MIN_CAMERA_SCALE, Math.min(MAX_CAMERA_SCALE, safePrevScale * factor))
  );
  const ratio = nextScale / safePrevScale;
  const nextTx = vx - VIEWBOX_CX - ratio * (vx - VIEWBOX_CX - prev.tx);
  const nextTy = vy - VIEWBOX_CY - ratio * (vy - VIEWBOX_CY - prev.ty);

  return clampCamera(nextScale, nextTx, nextTy);
}

/**
 * Translates a camera state by a client-pixel drag delta converted into viewBox units.
 *
 * @param origin - Camera state at the start of the drag (or prior step).
 * @param rect - Current bounding rectangle of the radar container.
 * @param deltaX - Horizontal drag displacement in CSS pixels.
 * @param deltaY - Vertical drag displacement in CSS pixels.
 * @returns Clamped `CameraState` shifted by the viewBox equivalent delta.
 */
export function panByClientDelta(
  origin: CameraState,
  rect: ViewportRect | null | undefined,
  deltaX: number,
  deltaY: number
): CameraState {
  const { scaleFactor } = getMeetViewport(rect);
  return clampCamera(
    origin.scale,
    origin.tx + deltaX / scaleFactor,
    origin.ty + deltaY / scaleFactor
  );
}
