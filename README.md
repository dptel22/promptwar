# Domino Sky — Airline OCC Disruption Cascade & Recovery Simulator

Interactive airline Operations Control Center (OCC) simulator across 16 Indian airports, 70 flights, 16 aircraft tail chains, 21 passenger connections, 16 crew duty clocks, and 2 spare aircraft.

## Core Architecture

1. **Deterministic Fixed-Point Cascade Engine (`src/lib/sim/engine.ts`):**
   - Evaluates turnaround propagation (`min_turnaround_minutes = 30`) and explicit turnaround buffer absorption *before* airport closure checks so delayed flights can never illegally depart from or arrive into a closed hub.
   - Tracks ATC airborne holding orbits (`holdingStartMin`–`holdingEndMin`), ground delay holds, `600m` crew legal duty cutoffs (`CREW_BREACH`), and inclusion-exclusion deduplicated stranded passengers.
2. **Deterministic Recovery & Zero-Hallucination Verifier (`src/lib/sim/recovery.ts`, `src/lib/sim/verify-ai.ts`):**
   - Enumerates physically valid countermeasures: spare aircraft swaps (`VT-DS17` at `BLR`, `VT-DS18` at `DEL`) with reserve crew duty validation, matched out-and-back or final-leg cancellations (zero aircraft teleportation), `<= 45m` hub connection holds, and non-conflicting 2-action combinations.
   - Server-side regex verifier checks every integer, flight ID, tail ID, crew ID, and connection ID in LLM prose against the deterministic allow-list, falling back cleanly to the engine briefing if any token drifts or when running offline.
3. **FlightRadar24-Style Operator UI:**
   - Aspect-corrected India vector radar (`src/components/RadarMap.tsx`), draggable storm cells, animated ATC holding-pattern racetrack orbits, Before/After ghost recovery overlays, synchronized 16-tail Gantt with `600m` duty cutoff walls, and plain-English crisis compiling (`/api/parse-crisis`).

## Local Development & Tests

```bash
npm install
npm test          # Vitest deterministic engine, recovery & verifier suite
npm run typecheck # TypeScript check
npm run dev       # http://localhost:3000
```

## Deploy to Vercel

Zero-config Next.js deployment on Node.js Fluid Compute:

```bash
npx vercel --prod
```

Optional environment variable in Vercel Project Settings: `AI_GATEWAY_API_KEY` (or `GEMINI_API_KEY`). Without any key set, Domino Sky runs seamlessly in deterministic `ENGINE MODE`.

## Deploy to Google Cloud Run

Includes `output: "standalone"` in `next.config.ts` and a multi-stage Node 24 LTS `Dockerfile` listening on `PORT=8080`:

```bash
gcloud run deploy domino-sky --source . --platform managed --allow-unauthenticated
```
