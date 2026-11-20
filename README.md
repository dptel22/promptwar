# Domino Sky — Flight Disruption Cascade & Recovery Simulator

## Chosen Vertical
**Domino Sky: Airline Operations Control Center (OCC) Disruption & Recovery Simulator** across a 16-airport Indian flight network (`70` scheduled flights, `16` aircraft tail chains, `21` passenger connections, `16` crew duty rosters, and `2` spare aircraft at `BLR` and `DEL`).

## Approach & Logic
All delay, crew legality, and stranded-passenger numbers are calculated **100% deterministically** by pure TypeScript simulation code—never guessed by an LLM:

1. **Fixed-Point Tail-Chain Cascade (`src/lib/sim/engine.ts`):**
   - Evaluates `min_turnaround_minutes = 30` and computes exact `bufferAbsorbedMin` per leg *before* checking airport closure holds (`[startMin, endMin)`), preventing late inbound flights from operating into/out of a closed hub.
   - Models Ground Delay Program (GDP) holds vs. airborne ATC holding orbits (`holdingStartMin`–`holdingEndMin`).
   - Enforces the `600`-minute crew legal duty limit (`CREW_BREACH`), grounding breached legs and excluding them from operated delay counts.
   - Uses exact inclusion-exclusion to prevent double-counting connecting passengers when both `from_flight` and `to_flight` are grounded.
2. **Physically Valid Recovery & AI Hallucination Verifier (`src/lib/sim/recovery.ts`, `src/lib/sim/verify-ai.ts`):**
   - Evaluates spare aircraft swaps (`VT-DS17` at `BLR`, `VT-DS18` at `DEL` with fresh reserve crew clock `takeoverDep - 30m` still bound by `600m`), physically legal cancellations (tail last leg or matched `A→B` + `B→A` round-trip pairs — zero aircraft teleportation), `<=45m` hub connection holds, and incremental follow-on recoveries.
   - `/api/dispatch` runs a regex allow-list verifier (`verifyAiBriefing`) over every integer, flight ID, tail ID, crew ID, and connection ID in LLM output, falling back automatically if any token drifts.
3. **Simulation-Trained Surrogate ML (`scripts/train-risk-model.ts`, `src/lib/ml/predict.ts`):**
   - Trained offline across `3,000` deterministic simulation runs (`80/20` split) using Ridge Regression (`R² = 0.651`, `MAE = 11.62`) for `0–100` pre-storm hub fragility and L2 Logistic Regression (`ROC-AUC = 0.914`) for `+30m` storm-extension crew-breach risk, serving `<1ms` pure-TS inference with zero conflict with deterministic counts.

## How the Solution Works
- **`/` (Kinetic Story):** Interactive sculpted relief map of India where users toggle live weather environments (*Mumbai Monsoon*, *Delhi Winter Fog*, *Guwahati Spoke*, *Dual-Hub Crisis*) and scroll through 3 choreographed modules explaining tail-chain cascades, ML fragility, and verified recovery.
- **`/simulator` (Top-Down Pan/Zoom OCC Simulator):** Full pan-and-zoom sculpted relief map of India with `Simple` and `Advanced` view modes, 2×2 flight telemetry, hourly flight-density histogram scrubber (`05:30–22:30 IST`), drag-and-drop storm triggers, `⌘K` plain-English crisis compiler (`/api/parse-crisis`), Before/After ghost diff overlays, and 1-click recovery + `Undo`.
- **`/intelligence` (ML & Stress-Test Lab):** Interactive 16-airport vulnerability ranking explorer and live browser execution of all 4 judging stress tests.

## Assumptions Made
- Single operating day (`05:30–22:30 IST`); closures are evaluated as half-open intervals `[startMin, endMin)`.
- Standby reserve crews on `VT-DS17` (`BLR`) and `VT-DS18` (`DEL`) begin their `600`-minute duty clock `30` minutes prior to takeover departure (`takeoverDep - 30m`).
- Only final legs or matched `A→B` + `B→A` round-trip spoke pairs may be cancelled so aircraft stay physically positioned for downstream legs.
- Without `AI_GATEWAY_API_KEY` or `GEMINI_API_KEY`, `/api/dispatch` and `/api/parse-crisis` run transparently in deterministic engine mode with full functionality.

## Local Development, Tests & Deployment

```bash
pnpm install
pnpm test          # 18 Vitest unit tests (engine, recovery, verifier, ML)
pnpm run typecheck # Strict TypeScript check
pnpm run build     # Standalone Next.js production build
pnpm start         # http://localhost:3000
```

- **Vercel:** `npx vercel --prod` (runs on default Node.js Fluid Compute).
- **Google Cloud Run:** `gcloud run deploy domino-sky --source . --platform managed --allow-unauthenticated` (uses `Dockerfile` with `output: "standalone"` on `PORT=8080`).
