import { describe, expect, it } from "vitest";
import { MAP_VIEWBOX } from "@/lib/geo";
import {
  DEFAULT_CAMERA,
  MAX_CAMERA_SCALE,
  MIN_CAMERA_SCALE,
  type CameraState,
  type ViewportRect,
  clampCamera,
  focusPoint,
  getInvScale,
  panByClientDelta,
  zoomAroundCenter,
  zoomAtClientPoint,
} from "./camera";

const CX = MAP_VIEWBOX.width / 2;
const CY = MAP_VIEWBOX.height / 2;

function toViewBoxPoint(rect: ViewportRect, clientX: number, clientY: number) {
  const sf = Math.min(rect.width / MAP_VIEWBOX.width, rect.height / MAP_VIEWBOX.height);
  const ox = (rect.width - MAP_VIEWBOX.width * sf) / 2;
  const oy = (rect.height - MAP_VIEWBOX.height * sf) / 2;
  return {
    vx: (clientX - rect.left - ox) / sf,
    vy: (clientY - rect.top - oy) / sf,
  };
}

function viewBoxToWorld(cam: CameraState, vx: number, vy: number) {
  return {
    wx: CX + (vx - CX - cam.tx) / cam.scale,
    wy: CY + (vy - CY - cam.ty) / cam.scale,
  };
}

function worldToViewBox(cam: CameraState, wx: number, wy: number) {
  return {
    vx: CX + cam.tx + cam.scale * (wx - CX),
    vy: CY + cam.ty + cam.scale * (wy - CY),
  };
}

describe("radar camera viewport math", () => {
  it("clamps scale, pan bounds, and avoids negative zero", () => {
    expect(DEFAULT_CAMERA).toEqual({ scale: 1.04, tx: 0, ty: 0 });
    expect(clampCamera(0.4, -0, 0)).toEqual({
      scale: MIN_CAMERA_SCALE,
      tx: 0,
      ty: 0,
    });
    expect(clampCamera(9, 99999, -99999)).toEqual({
      scale: MAX_CAMERA_SCALE,
      tx: Math.round(MAP_VIEWBOX.width * MAX_CAMERA_SCALE * 0.55 * 10) / 10,
      ty: -Math.round(MAP_VIEWBOX.height * MAX_CAMERA_SCALE * 0.55 * 10) / 10,
    });
  });

  it("computes dampened inverse scale cleanly", () => {
    expect(getInvScale(1)).toBe(1);
    expect(getInvScale(2.5)).toBe(Math.round((1 / Math.pow(2.5, 0.72)) * 1000) / 1000);
    expect(getInvScale(4)).toBeLessThan(getInvScale(1.5));
    expect(getInvScale(0)).toBeGreaterThan(1);
  });

  it("centers a target airport point in the viewBox via focusPoint", () => {
    const pt = { x: 420, y: 510 };
    const focused = focusPoint(pt, 2.6);
    expect(focused.scale).toBe(2.6);
    const screen = worldToViewBox(focused, pt.x, pt.y);
    expect(screen.vx).toBeCloseTo(CX, 0);
    expect(screen.vy).toBeCloseTo(CY, 0);

    const clampedFocus = focusPoint({ x: 500, y: 430 }, 10);
    expect(clampedFocus.scale).toBe(MAX_CAMERA_SCALE);
  });

  it("zooms proportionally around the viewBox center", () => {
    const start: CameraState = { scale: 2, tx: 120, ty: -80 };
    const worldCenterBefore = viewBoxToWorld(start, CX, CY);

    const zoomedIn = zoomAroundCenter(start, 1.3);
    expect(zoomedIn.scale).toBe(2.6);
    const centerAfter = worldToViewBox(zoomedIn, worldCenterBefore.wx, worldCenterBefore.wy);
    expect(centerAfter.vx).toBeCloseTo(CX, 0);
    expect(centerAfter.vy).toBeCloseTo(CY, 0);

    const minBounded = zoomAroundCenter({ scale: 0.95, tx: 40, ty: -20 }, 0.5);
    expect(minBounded).toEqual({ scale: 0.95, tx: 40, ty: -20 });
  });

  it("treats deltaY === 0 as a strict noop in zoomAtClientPoint", () => {
    const rect: ViewportRect = { left: 20, top: 60, width: 1200, height: 860 };
    const prev: CameraState = { scale: 1.8, tx: -45, ty: 30 };
    expect(zoomAtClientPoint(prev, rect, 420, 310, 0)).toBe(prev);
  });

  it("preserves the cursor pivot invariant across wide and tall letterboxed viewports", () => {
    const viewports: Array<{ rect: ViewportRect; clientX: number; clientY: number }> = [
      // Wide container: horizontal letterboxing around 1000x860 aspect
      { rect: { left: 40, top: 56, width: 1400, height: 860 }, clientX: 910, clientY: 340 },
      // Tall container: vertical letterboxing around 1000x860 aspect
      { rect: { left: 12, top: 80, width: 800, height: 1000 }, clientX: 300, clientY: 620 },
    ];

    for (const { rect, clientX, clientY } of viewports) {
      const prev: CameraState = { scale: 1.45, tx: 65, ty: -42 };
      const { vx, vy } = toViewBoxPoint(rect, clientX, clientY);
      const worldUnderCursor = viewBoxToWorld(prev, vx, vy);

      const zoomedIn = zoomAtClientPoint(prev, rect, clientX, clientY, -120);
      expect(zoomedIn.scale).toBeGreaterThan(prev.scale);
      const afterIn = worldToViewBox(zoomedIn, worldUnderCursor.wx, worldUnderCursor.wy);
      expect(afterIn.vx).toBeCloseTo(vx, 0);
      expect(afterIn.vy).toBeCloseTo(vy, 0);

      const zoomedOut = zoomAtClientPoint(prev, rect, clientX, clientY, 120);
      expect(zoomedOut.scale).toBeLessThan(prev.scale);
      const afterOut = worldToViewBox(zoomedOut, worldUnderCursor.wx, worldUnderCursor.wy);
      expect(afterOut.vx).toBeCloseTo(vx, 0);
      expect(afterOut.vy).toBeCloseTo(vy, 0);
    }
  });

  it("pans proportionally to letterboxed client pixel deltas and clamps edges", () => {
    const tallRect: ViewportRect = { left: 0, top: 0, width: 500, height: 860 };
    // scaleFactor = 500 / 1000 = 0.5 -> +50px client delta = +100 viewBox units
    const panned = panByClientDelta({ scale: 1.5, tx: 10, ty: -20 }, tallRect, 50, -25);
    expect(panned).toEqual({ scale: 1.5, tx: 110, ty: -70 });

    const clamped = panByClientDelta({ scale: 1, tx: 0, ty: 0 }, tallRect, 5000, -5000);
    expect(clamped).toEqual({
      scale: 1,
      tx: 550,
      ty: -473,
    });

    const fallback = panByClientDelta({ scale: 1.2, tx: 0, ty: 0 }, null, 30, 40);
    expect(fallback).toEqual({ scale: 1.2, tx: 30, ty: 40 });
  });
});
