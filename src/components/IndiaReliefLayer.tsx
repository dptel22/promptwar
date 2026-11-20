import { memo } from "react";
import indiaGeoRaw from "@/data/india-geo.json";
import { geoRingToSvgPath } from "@/lib/geo";

interface GeoFeature {
  properties: { name: string; kind: string };
  geometry: { type: "Polygon"; coordinates: number[][][] };
}

const FEATURES = (indiaGeoRaw as { features: GeoFeature[] }).features;
const MAINLAND_PATHS = FEATURES.filter(
  (f) => f.properties.kind !== "context"
).map((f) => ({
  name: f.properties.name,
  d: geoRingToSvgPath(f.geometry.coordinates[0]),
}));

const CONTEXT_PATHS = FEATURES.filter(
  (f) => f.properties.kind === "context"
).map((f) => ({
  name: f.properties.name,
  d: geoRingToSvgPath(f.geometry.coordinates[0]),
}));

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export const IndiaReliefLayer = memo(function IndiaReliefLayer({
  scaleFactor = 1,
}: {
  scaleFactor?: number;
}) {
  const shadowOffsetY = round2(10 * scaleFactor);
  const bevelOffsetY = round2(5 * scaleFactor);
  const contextStroke = round2(1 * scaleFactor);
  const bevelStroke = round2(0.85 * scaleFactor);
  const topStroke = round2(1.25 * scaleFactor);

  return (
    <g aria-hidden="true">
      {/* Subtle Sri Lanka context outline */}
      {CONTEXT_PATHS.map((p) => (
        <path
          key={`ctx-${p.name}`}
          d={p.d}
          fill="#F4F7FB"
          stroke="#D5DFEE"
          strokeWidth={contextStroke}
          strokeLinejoin="round"
        />
      ))}

      {/* Sculpted cool drop shadow */}
      <g transform={`translate(0, ${shadowOffsetY})`}>
        {MAINLAND_PATHS.map((p) => (
          <path
            key={`shadow-${p.name}`}
            d={p.d}
            fill="#D5DFEE"
            fillOpacity={0.78}
            stroke="none"
          />
        ))}
      </g>

      {/* Sculpted mid-bevel ridge */}
      <g transform={`translate(0, ${bevelOffsetY})`}>
        {MAINLAND_PATHS.map((p) => (
          <path
            key={`bevel-${p.name}`}
            d={p.d}
            fill="#E3EAF5"
            stroke="#CFD9E8"
            strokeWidth={bevelStroke}
            strokeLinejoin="round"
          />
        ))}
      </g>

      {/* Elevated pure-white top landmass */}
      {MAINLAND_PATHS.map((p) => (
        <path
          key={`top-${p.name}`}
          d={p.d}
          fill="#FFFFFF"
          stroke="#B9C6DA"
          strokeWidth={topStroke}
          strokeLinejoin="round"
        />
      ))}
    </g>
  );
});
