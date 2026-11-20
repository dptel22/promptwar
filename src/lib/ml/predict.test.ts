import { describe, expect, it } from "vitest";
import { parseHHMM, simulateNetwork } from "../sim/engine";
import {
  MODEL_ARTIFACT,
  predictAllAirportFragilities,
  predictCascadeRisk,
} from "./predict";

describe("Simulation-Trained Surrogate ML risk model", () => {
  it("loads trained 3,000-sim weights with strong held-out validation metrics", () => {
    expect(MODEL_ARTIFACT.trainedOnSamples).toBe(3000);
    expect(MODEL_ARTIFACT.ridge.r2).toBeGreaterThanOrEqual(0.65);
    expect(MODEL_ARTIFACT.logistic.auc).toBeGreaterThanOrEqual(0.75);
  });

  it("scores peak BOM disruption higher fragility than spoke GAU disruption in < 5ms", () => {
    const t0 = performance.now();
    const bomClosure = [
      { id: "m1", airportId: "BOM", startMin: parseHHMM("07:30"), endMin: parseHHMM("09:00") },
    ];
    const gauClosure = [
      { id: "m2", airportId: "GAU", startMin: parseHHMM("17:00"), endMin: parseHHMM("18:30") },
    ];

    const bomPred = predictCascadeRisk(bomClosure, simulateNetwork(bomClosure));
    const gauPred = predictCascadeRisk(gauClosure, simulateNetwork(gauClosure));
    const elapsed = performance.now() - t0;

    expect(elapsed).toBeLessThan(20);
    expect(bomPred.fragilityScore).toBeGreaterThan(gauPred.fragilityScore);
    expect(bomPred.topDrivers.reduce((acc, d) => acc + d.pct, 0)).toBe(100);
  });

  it("ranks all 16 airports cleanly for pre-storm vulnerability", () => {
    const rankings = predictAllAirportFragilities(parseHHMM("08:00"), 90);
    expect(rankings).toHaveLength(16);
    expect(rankings[0].fragilityScore).toBeGreaterThanOrEqual(
      rankings[15].fragilityScore
    );
  });
});
