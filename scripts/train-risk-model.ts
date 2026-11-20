import fs from "node:fs";
import path from "node:path";
import { DATASET, simulateNetwork } from "../src/lib/sim/engine";
import {
  FEATURE_LABELS,
  FEATURE_NAMES,
  extractRiskFeatures,
} from "../src/lib/ml/features";
import type { AirportClosure } from "../src/lib/sim/types";

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > Math.abs(M[pivot][col])) pivot = row;
    }
    [M[col], M[pivot]] = [M[pivot], M[col]];
    const diag = M[col][col] || 1e-8;
    for (let j = col; j <= n; j++) M[col][j] /= diag;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = M[row][col];
      for (let j = col; j <= n; j++) M[row][j] -= factor * M[col][j];
    }
  }
  return M.map((row) => row[n]);
}

function sigmoid(z: number): number {
  if (z > 20) return 1;
  if (z < -20) return 0;
  return 1 / (1 + Math.exp(-z));
}

function computeAuc(yTrue: number[], yProb: number[]): number {
  const pairs = yTrue.map((y, i) => ({ y, p: yProb[i] })).sort((a, b) => a.p - b.p);
  let posCount = 0;
  let negCount = 0;
  let rankSum = 0;
  for (let i = 0; i < pairs.length; i++) {
    if (pairs[i].y === 1) {
      posCount++;
      rankSum += i + 1;
    } else {
      negCount++;
    }
  }
  if (posCount === 0 || negCount === 0) return 0.5;
  return (rankSum - (posCount * (posCount + 1)) / 2) / (posCount * negCount);
}

function main() {
  const rng = mulberry32(20261120);
  const airportIds = DATASET.airports.map((a) => a.id);

  interface Sample {
    x: number[];
    yFragility: number;
    yCliff: number;
  }

  const samples: Sample[] = [];
  const TOTAL_SAMPLES = 3000;

  for (let i = 0; i < TOTAL_SAMPLES; i++) {
    const isDual = i >= 2500;
    const closures: AirportClosure[] = [];

    const a1 = airportIds[Math.floor(rng() * airportIds.length)];
    const start1 = 360 + Math.floor(rng() * 840); // 06:00..20:00
    const dur1 = 15 + Math.floor(rng() * 166); // 15..180m
    closures.push({
      id: `sim-${i}-a`,
      airportId: a1,
      startMin: start1,
      endMin: Math.min(1380, start1 + dur1),
    });

    if (isDual) {
      let a2 = airportIds[Math.floor(rng() * airportIds.length)];
      if (a2 === a1) {
        a2 = airportIds[(airportIds.indexOf(a1) + 1) % airportIds.length];
      }
      const start2 = 360 + Math.floor(rng() * 840);
      const dur2 = 20 + Math.floor(rng() * 130);
      closures.push({
        id: `sim-${i}-b`,
        airportId: a2,
        startMin: start2,
        endMin: Math.min(1380, start2 + dur2),
      });
    }

    const cur = simulateNetwork(closures, []);
    const ext = simulateNetwork(
      closures.map((c) => ({ ...c, endMin: Math.min(1380, c.endMin + 30) })),
      []
    );

    const x = extractRiskFeatures(closures);
    const m = cur.metrics;
    const rawFragility =
      m.totalStrandedPax * 0.25 +
      m.totalDelayMinutes * 0.045 +
      m.crewBreaches * 28;
    const yFragility = Math.min(100, Math.round(rawFragility * 100) / 100);

    const yCliff =
      ext.metrics.crewBreaches > m.crewBreaches ||
      ext.metrics.totalStrandedPax - m.totalStrandedPax >= 35 ||
      ext.metrics.totalDelayMinutes - m.totalDelayMinutes >= 150
        ? 1
        : 0;

    samples.push({ x, yFragility, yCliff });
  }

  // Shuffle deterministically and split 80/20
  for (let i = samples.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [samples[i], samples[j]] = [samples[j], samples[i]];
  }

  const splitIdx = Math.floor(samples.length * 0.8);
  const train = samples.slice(0, splitIdx);
  const test = samples.slice(splitIdx);
  const d = FEATURE_NAMES.length;

  // Compute scaler on train split only
  const means = new Array<number>(d).fill(0);
  const stds = new Array<number>(d).fill(0);
  for (const s of train) {
    for (let j = 0; j < d; j++) means[j] += s.x[j];
  }
  for (let j = 0; j < d; j++) means[j] /= train.length;
  for (const s of train) {
    for (let j = 0; j < d; j++) stds[j] += (s.x[j] - means[j]) ** 2;
  }
  for (let j = 0; j < d; j++) {
    stds[j] = Math.sqrt(stds[j] / train.length) || 1;
  }

  const scaleVec = (x: number[]) => x.map((v, j) => (v - means[j]) / stds[j]);

  // 1. Closed-form Ridge Regression for Fragility Score (0..100)
  const dim = d + 1;
  const XtX = Array.from({ length: dim }, () => new Array<number>(dim).fill(0));
  const Xty = new Array<number>(dim).fill(0);
  const ridgeLambda = 2.0;

  for (const s of train) {
    const xs = [1, ...scaleVec(s.x)];
    for (let i = 0; i < dim; i++) {
      Xty[i] += xs[i] * s.yFragility;
      for (let j = 0; j < dim; j++) XtX[i][j] += xs[i] * xs[j];
    }
  }
  for (let j = 1; j < dim; j++) XtX[j][j] += ridgeLambda;
  const ridgeTheta = solveLinearSystem(XtX, Xty);

  // Evaluate Ridge R2 & MAE on held-out test set
  const yMeanTest =
    test.reduce((acc, s) => acc + s.yFragility, 0) / test.length;
  let ssRes = 0;
  let ssTot = 0;
  let absErr = 0;
  for (const s of test) {
    const xs = scaleVec(s.x);
    let pred = ridgeTheta[0];
    for (let j = 0; j < d; j++) pred += ridgeTheta[j + 1] * xs[j];
    pred = Math.max(0, Math.min(100, pred));
    ssRes += (s.yFragility - pred) ** 2;
    ssTot += (s.yFragility - yMeanTest) ** 2;
    absErr += Math.abs(s.yFragility - pred);
  }
  const r2 = Math.round((1 - ssRes / ssTot) * 1000) / 1000;
  const mae = Math.round((absErr / test.length) * 100) / 100;

  // 2. L2-Regularized Logistic Regression for +30m Extension Risk
  let logBias = 0;
  const logWeights = new Array<number>(d).fill(0);
  const lr = 0.25;
  const reg = 0.01;
  const trainScaled = train.map((s) => ({ x: scaleVec(s.x), y: s.yCliff }));

  for (let epoch = 0; epoch < 500; epoch++) {
    let gradB = 0;
    const gradW = new Array<number>(d).fill(0);
    for (const s of trainScaled) {
      let z = logBias;
      for (let j = 0; j < d; j++) z += logWeights[j] * s.x[j];
      const err = sigmoid(z) - s.y;
      gradB += err;
      for (let j = 0; j < d; j++) gradW[j] += err * s.x[j];
    }
    logBias -= (lr * gradB) / trainScaled.length;
    for (let j = 0; j < d; j++) {
      logWeights[j] -=
        lr * (gradW[j] / trainScaled.length + reg * logWeights[j]);
    }
  }

  const testY = test.map((s) => s.yCliff);
  const testProbs = test.map((s) => {
    const xs = scaleVec(s.x);
    let z = logBias;
    for (let j = 0; j < d; j++) z += logWeights[j] * xs[j];
    return sigmoid(z);
  });
  const auc = Math.round(computeAuc(testY, testProbs) * 1000) / 1000;
  const accuracy =
    Math.round(
      (testProbs.filter((p, i) => (p >= 0.5 ? 1 : 0) === testY[i]).length /
        test.length) *
        1000
    ) / 1000;

  const modelArtifact = {
    version: "1.0.0",
    trainedOnSamples: TOTAL_SAMPLES,
    trainSamples: train.length,
    testSamples: test.length,
    positiveRate:
      Math.round((samples.filter((s) => s.yCliff === 1).length / TOTAL_SAMPLES) * 1000) / 1000,
    featureNames: [...FEATURE_NAMES],
    featureLabels: FEATURE_LABELS,
    scaler: {
      means: means.map((v) => Math.round(v * 10000) / 10000),
      stds: stds.map((v) => Math.round(v * 10000) / 10000),
    },
    ridge: {
      bias: Math.round(ridgeTheta[0] * 10000) / 10000,
      weights: ridgeTheta.slice(1).map((v) => Math.round(v * 10000) / 10000),
      r2,
      mae,
    },
    logistic: {
      bias: Math.round(logBias * 10000) / 10000,
      weights: logWeights.map((v) => Math.round(v * 10000) / 10000),
      auc,
      accuracy,
    },
  };

  const outPath = path.resolve(process.cwd(), "src/lib/ml/risk-model.json");
  fs.writeFileSync(outPath, JSON.stringify(modelArtifact, null, 2) + "\n");
  console.log(
    `Trained Surrogate ML on ${TOTAL_SAMPLES} sims -> R2=${r2}, MAE=${mae}, AUC=${auc}, Acc=${accuracy}, PosRate=${modelArtifact.positiveRate}`
  );
}

main();
