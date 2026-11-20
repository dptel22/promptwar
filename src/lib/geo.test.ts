import { describe, expect, it } from "vitest";
import {
  AIRPORT_POINTS,
  describeArc,
  getAirportPoint,
  holdingOrbitPosition,
  interpolateFlightPosition,
  MAP_VIEWBOX,
  polarToCartesian,
  projectLatLng,
  round2,
} from "./geo";

describe("geo math helpers", () => {
  it("round2 rounds to 2 decimals and normalises negative zero", () => {
    expect(round2(1.005 * 1000)).toBe(1005);
    expect(round2(3.14159)).toBe(3.14);
    expect(round2(-0.001)).toBe(0);
    expect(Object.is(round2(-0.001), -0)).toBe(false);
  });

  it("polarToCartesian places 0deg at 12 o'clock and increases clockwise", () => {
    expect(polarToCartesian(100, 100, 50, 0)).toEqual({ x: 100, y: 50 });
    expect(polarToCartesian(100, 100, 50, 90)).toEqual({ x: 150, y: 100 });
    expect(polarToCartesian(100, 100, 50, 180)).toEqual({ x: 100, y: 150 });
    expect(polarToCartesian(100, 100, 50, 270)).toEqual({ x: 50, y: 100 });
  });

  it("describeArc emits a small-arc and large-arc SVG path", () => {
    expect(describeArc(100, 100, 50, 0, 90)).toBe("M 150 100 A 50 50 0 0 0 100 50");
    expect(describeArc(100, 100, 50, 0, 270)).toBe("M 50 100 A 50 50 0 1 0 100 50");
  });

  it("projectLatLng keeps India inside the viewBox and orients north up / east right", () => {
    const delhi = projectLatLng(28.55, 77.1);
    const chennai = projectLatLng(13.0, 80.2);
    const mumbai = projectLatLng(19.1, 72.87);
    for (const p of [delhi, chennai, mumbai]) {
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(MAP_VIEWBOX.width);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(MAP_VIEWBOX.height);
    }
    expect(delhi.y).toBeLessThan(chennai.y);
    expect(chennai.x).toBeGreaterThan(mumbai.x);
  });

  it("getAirportPoint resolves known IATA codes and rejects unknown ones", () => {
    expect(AIRPORT_POINTS.size).toBe(16);
    const del = getAirportPoint("DEL");
    expect(del).toBeDefined();
    expect(del).toEqual(AIRPORT_POINTS.get("DEL"));
    expect(getAirportPoint("XXX")).toBeUndefined();
  });

  it("interpolateFlightPosition hits both endpoints, clamps progress, and bows off the chord", () => {
    const from = { x: 100, y: 100 };
    const to = { x: 500, y: 100 };

    expect(interpolateFlightPosition(from, to, 0)).toMatchObject(from);
    expect(interpolateFlightPosition(from, to, 1)).toMatchObject(to);
    expect(interpolateFlightPosition(from, to, -5)).toMatchObject(from);
    expect(interpolateFlightPosition(from, to, 9)).toMatchObject(to);

    const mid = interpolateFlightPosition(from, to, 0.5);
    expect(mid.x).toBe(300);
    expect(mid.y).not.toBe(100);
  });

  it("interpolateFlightPosition heading points along the direction of travel", () => {
    const east = interpolateFlightPosition({ x: 0, y: 0 }, { x: 400, y: 0 }, 0.5);
    expect(Math.abs(east.angleDeg)).toBeLessThan(5);
    const west = interpolateFlightPosition({ x: 400, y: 0 }, { x: 0, y: 0 }, 0.5);
    expect(Math.abs(Math.abs(west.angleDeg) - 180)).toBeLessThan(5);
  });

  it("holdingOrbitPosition stays on its racetrack ellipse and is deterministic", () => {
    const center = { x: 300, y: 300 };
    for (const slot of [0, 1, 2, 3]) {
      const rx = 24 + (slot % 2) * 8;
      const ry = 14 + (slot % 2) * 5;
      const pos = holdingOrbitPosition(center, 600, slot);
      const ellipse = ((pos.x - center.x) / rx) ** 2 + ((pos.y - center.y) / ry) ** 2;
      expect(ellipse).toBeGreaterThan(0.98);
      expect(ellipse).toBeLessThan(1.02);
    }
    expect(holdingOrbitPosition(center, 600, 1)).toEqual(holdingOrbitPosition(center, 600, 1));
    expect(holdingOrbitPosition(center, 600, 0)).not.toEqual(holdingOrbitPosition(center, 600, 1));
  });
});
