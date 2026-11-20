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

export function IndiaReliefLayer({ scaleFactor = 1 }: { scaleFactor?: number }) {
  return (
    <g aria-hidden="true">
      {/* Subtle Sri Lanka reference outline */}
      {CONTEXT_PATHS.map((p) => (
        <path
          key={`ctx-${p.name}`}
          d={p.d}
          fill="#F1F5F9"
          stroke="#CBD5E1"
          strokeWidth={1 * scaleFactor}
          strokeLinejoin="round"
        />
      ))}

      {/* Sculpted paper relief drop shadow */}
      <g transform={`translate(0, ${9 * scaleFactor})`}>
        {MAINLAND_PATHS.map((p) => (
          <path
            key={`shadow-${p.name}`}
            d={p.d}
            fill="#CBD5E1"
            fillOpacity={0.75}
            stroke="none"
          />
        ))}
      </g>

      {/* Sculpted mid-bevel ridge */}
      <g transform={`translate(0, ${4.5 * scaleFactor})`}>
        {MAINLAND_PATHS.map((p) => (
          <path
            key={`bevel-${p.name}`}
            d={p.d}
            fill="#E2E8F0"
            stroke="#CBD5E1"
            strokeWidth={0.8 * scaleFactor}
            strokeLinejoin="round"
          />
        ))}
      </g>

      {/* Crisp elevated white India landmass */}
      {MAINLAND_PATHS.map((p) => (
        <path
          key={`top-${p.name}`}
          d={p.d}
          fill="#FFFFFF"
          stroke="#94A3B8"
          strokeWidth={1.3 * scaleFactor}
          strokeLinejoin="round"
        />
      ))}
    </g>
  );
}
