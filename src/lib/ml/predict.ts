import { DATASET, formatHHMM } from "../sim/engine";
import type { AirportClosure, AirportTier, SimulationResult } from "../sim/types";
import { FEATURE_LABELS, FEATURE_NAMES, extractRiskFeatures } from "./features";
import rawModel from "./risk-model.json";

export interface RiskModelArtifact {
  version: string;
  trainedOnSamples: number;
  trainSamples: number;
  testSamples: number;
  positiveRate: number;
  featureNames: string[];
  featureLabels: Record<string, string>;
  scaler: { means: number[]; stds: number[] };
  ridge: { bias: number; weights: number[]; r2: number; mae: number };
  logistic: { bias: number; weights: number[]; auc: number; accuracy: number };
}

export const MODEL_ARTIFACT = rawModel as RiskModelArtifact;

export interface RiskDriver {
  key: string;
  label: string;
  pct: number;
  rawValue: string;
}

export type SeverityClass = "Localized" | "Regional" | "Network Meltdown";

export interface CascadeRiskPrediction {
  fragilityScore: number;
  severityClass: SeverityClass;
  extensionBreachProb: number;
  topDrivers: RiskDriver[];
  modelMeta: {
    samples: number;
    r2: number;
    mae: number;
    auc: number;
    accuracy: number;
  };
}

export interface AirportFragilityRank {
  airportId: string;
  city: string;
  tier: AirportTier;
  fragilityScore: number;
  extensionBreachProb: number;
  severityClass: SeverityClass;
  topDriver: RiskDriver;
}

function sigmoid(z: number): number {
  if (z > 20) return 1;
  if (z < -20) return 0;
  return 1 / (1 + Math.exp(-z));
}

function formatRawFeature(key: string, val: number): string {
  switch (key) {
    case "activeFlightsInWindow":
      return `${Math.round(val)} flights`;
    case "tightTurnaroundCount":
      return `${Math.round(val)} legs`;
    case "connectingPaxExposed":
      return `${Math.round(val)} pax`;
    case "minCrewMarginMins":
      return `${Math.round(val)}m slack`;
    case "hourOfDay":
      return `${formatHHMM(Math.round(val * 60))} IST`;
    case "stormDurationMins":
      return `${Math.round(val)}m`;
    case "bufferShatterLoad":
      return `${Math.round(val)} idx`;
    case "closureFlightImpact":
      return `${val.toFixed(1)} flt·hr`;
    case "downstreamLegsExposed":
      return `${Math.round(val)} legs`;
    default:
      return String(Math.round(val));
  }
}

export function predictCascadeRisk(
  closures: AirportClosure[],
  simulation?: SimulationResult
): CascadeRiskPrediction {
  const modelMeta = {
    samples: MODEL_ARTIFACT.trainedOnSamples,
    r2: MODEL_ARTIFACT.ridge.r2,
    mae: MODEL_ARTIFACT.ridge.mae,
    auc: MODEL_ARTIFACT.logistic.auc,
    accuracy: MODEL_ARTIFACT.logistic.accuracy,
  };

  if (closures.length === 0) {
    return {
      fragilityScore: 0,
      severityClass: "Localized",
      extensionBreachProb: 0,
      topDrivers: [
        { key: "activeFlightsInWindow", label: "Flights in storm window", pct: 100, rawValue: "0 flights" },
      ],
      modelMeta,
    };
  }

  const x = extractRiskFeatures(closures, simulation);
  if (x[0] === 0 && (!simulation || simulation.metrics.delayedFlights === 0)) {
    return {
      fragilityScore: 0,
      severityClass: "Localized",
      extensionBreachProb: 2,
      topDrivers: [
        {
          key: "activeFlightsInWindow",
          label: FEATURE_LABELS.activeFlightsInWindow,
          pct: 100,
          rawValue: "0 flights",
        },
      ],
      modelMeta,
    };
  }

  const { means, stds } = MODEL_ARTIFACT.scaler;
  const xs = x.map((v, i) => (v - means[i]) / (stds[i] || 1));

  let ridgePred = MODEL_ARTIFACT.ridge.bias;
  let logZ = MODEL_ARTIFACT.logistic.bias;

  const rawDrivers: Array<{ key: string; label: string; score: number; rawValue: string }> = [];

  for (let i = 0; i < FEATURE_NAMES.length; i++) {
    const rw = MODEL_ARTIFACT.ridge.weights[i] ?? 0;
    const lw = MODEL_ARTIFACT.logistic.weights[i] ?? 0;
    ridgePred += rw * xs[i];
    logZ += lw * xs[i];

    const key = FEATURE_NAMES[i];
    // Combine standardized magnitude weighted toward positive risk escalation
    const contrib = Math.max(0.01, Math.abs(rw * xs[i]) + Math.abs(lw * xs[i]) * 12);
    rawDrivers.push({
      key,
      label: FEATURE_LABELS[key],
      score: contrib,
      rawValue: formatRawFeature(key, x[i]),
    });
  }

  const fragilityScore = Math.max(0, Math.min(100, Math.round(ridgePred)));
  const extensionBreachProb = Math.max(
    1,
    Math.min(99, Math.round(sigmoid(logZ) * 100))
  );

  const severityClass: SeverityClass =
    fragilityScore >= 65
      ? "Network Meltdown"
      : fragilityScore >= 32
        ? "Regional"
        : "Localized";

  rawDrivers.sort((a, b) => b.score - a.score);
  const top3 = rawDrivers.slice(0, 3);
  const totalTop = top3.reduce((acc, d) => acc + d.score, 0) || 1;
  const topDrivers: RiskDriver[] = top3.map((d) => ({
    key: d.key,
    label: d.label,
    pct: Math.round((d.score / totalTop) * 100),
    rawValue: d.rawValue,
  }));
  // Ensure top 3 sum cleanly to 100%
  const sumPct = topDrivers.reduce((acc, d) => acc + d.pct, 0);
  if (topDrivers.length > 0 && sumPct !== 100) {
    topDrivers[0].pct += 100 - sumPct;
  }

  return {
    fragilityScore,
    severityClass,
    extensionBreachProb,
    topDrivers,
    modelMeta,
  };
}

export function predictAllAirportFragilities(
  startMin: number,
  durationMin = 90
): AirportFragilityRank[] {
  const endMin = Math.min(1380, startMin + durationMin);
  return DATASET.airports
    .map((airport) => {
      const pred = predictCascadeRisk([
        {
          id: `probe-${airport.id}`,
          airportId: airport.id,
          startMin,
          endMin,
        },
      ]);
      return {
        airportId: airport.id,
        city: airport.city,
        tier: airport.tier,
        fragilityScore: pred.fragilityScore,
        extensionBreachProb: pred.extensionBreachProb,
        severityClass: pred.severityClass,
        topDriver: pred.topDrivers[0],
      };
    })
    .sort((a, b) => b.fragilityScore - a.fragilityScore);
}
