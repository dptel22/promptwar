# Domino Sky — Flight Disruption Cascade & Recovery Simulator

**Live Demo:** [https://domino-sky-henna.vercel.app](https://domino-sky-henna.vercel.app)

Domino Sky is a deterministic Airline Operations Control Center (OCC) disruption cascade simulator and verified recovery workbench for a 16-airport Indian aviation network.

## Chosen Vertical
**Domino Sky: Airline Operations Control Center (OCC) Disruption & Recovery Simulator** across a 16-airport Indian flight network (`70` scheduled flights, `16` aircraft tail chains, `21` passenger connections, `16` crew duty rosters, and `2` standby spare aircraft at `BLR` and `DEL`).

## Approach & Logic
All delay, crew legality, and stranded-passenger numbers are calculated **100% deterministically** by pure TypeScript simulation code—never guessed by an LLM:

1. **Fixed-Point Tail-Chain Cascade (`src/lib/sim/engine.ts`, `turnaround.ts`, `closure-holds.ts`, `tail-state.ts`, `cause-chain.ts`, `metrics.ts`):**
   - Evaluates `min_turnaround_minutes = 30` and computes exact `bufferAbsorbedMin` per leg *before* checking airport closure holds (`[startMin, endMin)`), preventing late inbound flights from operating into or out of a closed hub.
   - Models Ground Delay Program (GDP) holds vs. airborne ATC holding orbits (`holdingStartMin`–`holdingEndMin`).
   - Enforces the `600`-minute crew legal duty limit (`CREW_BREACH`), grounding breached legs and excluding them from operated delay counts.
   - Uses exact inclusion-exclusion to prevent double-counting connecting passengers when both `from_flight` and `to_flight` are grounded.
2. **Physically Valid Recovery, What-If Query Engine & AI Verifier (`src/lib/sim/recovery.ts`, `recovery-actions.ts`, `briefing.ts`, `query.ts`, `verify-ai.ts`):**
   - Evaluates single-use spare aircraft swaps (`VT-DS17` at `BLR`, `VT-DS18` at `DEL` with fresh reserve crew clock `takeoverDep - 30m` still bound by `600m`), physically legal cancellations (tail last leg or matched `A→B` + `B→A` round-trip pairs — zero aircraft teleportation), `<=45m` hub connection holds, and incremental follow-on recoveries.
   - `answerDispatcherQuery` resolves live `+30m` storm-extension cliff checks, worst domino chain traces, flight/tail lookups, and plain-English storm probes deterministically.
   - `/api/dispatch` runs a regex allow-list verifier (`verifyAiBriefing`) over every integer, flight ID, tail ID, crew ID, and connection ID in LLM output, falling back automatically if any token drifts.
3. **Simulation-Trained Surrogate ML (`scripts/train-risk-model.ts`, `src/lib/ml/predict.ts`, `features.ts`):**
   - Trained offline across `3,000` deterministic simulation runs (`80/20` split) using Ridge Regression (`R² = 0.651`, `MAE = 11.62`) for `0–100` pre-storm hub fragility and L2 Logistic Regression (`ROC-AUC = 0.914`) for `+30m` storm-extension crew-breach risk, serving `<1ms` pure-TS inference with zero conflict with deterministic counts.

## How the Solution Works
- **`/` (Kinetic Story):** Anime.js-choreographed 3-act landing page with a live circular chronograph dial and sculpted relief map of India (`AnimeHeroDial`), a sticky scroll-scrubbed 6-layer isometric architecture blueprint (`ExplodedBlueprint` + `BlueprintPlates`), and a sticky chronograph showcase (`LandingModules` + `ModuleStageViews`).
- **`/simulator` (Top-Down Spatial OCC Simulator):** Alabaster Dribbble-inspired pan-and-zoom India map (`RadarMap`, `camera.ts`, `RadarOverlays`, `RadarEntities`) with live `requestAnimationFrame` aircraft motion by default (`useSimulatorState`), borderless floating 2×2 flight statistics (`FlightStatsOverlay`), `15–240m` storm duration slider (`AirportClosurePopover`), `Simple` and `Advanced` (`TailChainGantt` + `GanttTables` + Hub Fragility Rings) modes, `⌘K` plain-English crisis compiler (`/api/parse-crisis`), Before/After ghost diff overlays, and a streamlined AI Helper drawer (`AiDispatcherDrawer`) with a 1-line status, `#1 Best Fix` hero card, collapsible alternatives, and a docked bottom Quick-Ask console + `Undo`.
- **`/about` (Methodology & Verification):** Architecture, mathematical cascade guarantees, ML model evaluation summary, and live in-browser execution of all 4 judging stress tests (`StressVerifiers`).

## Modular Architecture Map
Every production source file in `src/` is strictly modularized (`<= 322` lines per file, single-responsibility functions, JSDoc headers, zero non-null `!` assertions):

```text
src/
├── app/
│   ├── page.tsx                        # Act 1–3 kinetic landing page
│   ├── simulator/page.tsx              # Spatial OCC simulator workspace
│   ├── about/page.tsx                  # Methodology & live stress-test verifiers
│   └── api/
│       ├── dispatch/route.ts           # Grounded AI recovery dispatcher endpoint
│       ├── parse-crisis/route.ts       # Plain-English crisis compiler endpoint
│       └── routes.test.ts              # Route security, 400/413 & verifier tests
├── components/
│   ├── RadarMap.tsx                    # Pan/zoom spatial radar container
│   ├── radar/
│   │   ├── camera.ts & camera.test.ts  # Pure letterboxed SVG viewport & zoom math
│   │   ├── RadarOverlays.tsx           # Route arcs, ghost diffs, storms & holding rings
│   │   └── RadarEntities.tsx           # Keyboard-accessible airport beacons & aircraft
│   ├── simulator/
│   │   ├── useSimulatorState.ts        # URL sync, undo history, RAF clock & dispatch hook
│   │   └── FlightStatsOverlay.tsx      # Floating 2x2 flight telemetry & airport drawer
│   ├── AiDispatcherDrawer.tsx          # Streamlined AI Helper & bottom Quick-Ask bar
│   ├── TailChainGantt.tsx              # 16-tail timeline Gantt & crew cutoff wall
│   ├── gantt/GanttTables.tsx           # Passenger connection & crew legality tables
│   ├── AnimeHeroDial.tsx               # Circular aviation chronograph & India aperture
│   ├── ExplodedBlueprint.tsx           # Sticky scroll-scrubbed 6-layer isometric stack
│   ├── LandingModules.tsx              # Sticky 360° chronograph capability showcase
│   ├── landing/
│   │   ├── BlueprintPlates.tsx         # Memoized isometric layer vector plates
│   │   └── ModuleStageViews.tsx        # Scroll-interpolated Ch 0–2 stage visualizations
│   └── about/StressVerifiers.tsx       # Live in-browser judging stress-test runner
└── lib/
    ├── geo.ts & geo.test.ts            # WGS84 -> SVG projection, Bezier & polar math
    ├── ai/server-helpers.ts            # Model resolution & 32 KiB bounded JSON parser
    ├── ml/                             # Offline-trained Ridge & Logistic surrogate
    └── sim/
        ├── constants.ts & presets.ts   # Domain bounds, IST formatters & scenario presets
        ├── engine.ts & engine.test.ts  # Fixed-point cascade orchestrator & unit tests
        ├── turnaround.ts               # Turnaround propagation & buffer absorption
        ├── closure-holds.ts            # GDP vs airborne ATC holding solver
        ├── tail-state.ts               # Reserve swaps & 600m crew legality tracker
        ├── cause-chain.ts              # Multi-hop domino lineage builder
        ├── metrics.ts                  # Inclusion-exclusion connection & network metrics
        ├── recovery.ts & recovery.test.ts # Counterfactual ranker & compatibility rules
        ├── recovery-actions.ts         # Spare swap, cancel & <=45m hold enumerators
        ├── briefing.ts                 # Adaptive zero-hallucination deterministic briefing
        ├── query.ts                    # +30m cliff & worst-chain what-if query engine
        ├── parse-crisis.ts             # Deterministic multi-airport NL crisis parser
        └── verify-ai.ts & verify-ai.test.ts # Regex allow-list token & integer verifier
```

## Assumptions Made
- Single operating day (`05:30–22:30 IST`); closures are evaluated as half-open intervals `[startMin, endMin)`.
- Standby reserve crews on `VT-DS17` (`BLR`) and `VT-DS18` (`DEL`) begin their `600`-minute duty clock `30` minutes prior to takeover departure (`takeoverDep - 30m`), and each physical spare aircraft can be assigned at most once.
- Only final legs or matched `A→B` + `B→A` round-trip spoke pairs may be cancelled so aircraft stay physically positioned for downstream legs.
- Without `AI_GATEWAY_API_KEY` or `GEMINI_API_KEY`, `/api/dispatch` and `/api/parse-crisis` run transparently in deterministic engine mode with full functionality.

## Engineering Quality & Safeguards
- **Code Quality:** Modular architecture (`<= 322` lines per file across all 45+ modules), comprehensive module and JSDoc annotations, zero duplicated math/API helpers, zero unsafe non-null (`!`) assertions or `any` casts, and strict TypeScript (`tsc --noEmit`).
- **Security:** 32 KiB request payload ceiling (`HTTP 413`), malformed-JSON `HTTP 400` guards, strict Zod validation (`VALID_IATA` enum, `endMin > startMin` refinement, bounded string/array lengths), separate `system` vs. user `prompt` isolation against prompt injection, `Cache-Control: no-store` on API responses, and `Content-Security-Policy`, `Strict-Transport-Security`, `Permissions-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `X-DNS-Prefetch-Control`, and `Referrer-Policy` headers in `next.config.ts`.
- **Efficiency:** Memoized SVG relief, overlay, and blueprint components (`React.memo`), precomputed airport coordinate/route maps, `requestAnimationFrame`-coalesced scroll listeners and visibility/offscreen-paused animation loops, and lazy ML fragility evaluation only when `Advanced` + `Hub Fragility Rings` is toggled on.
- **Testing:** **57 passing Vitest unit & integration tests across 7 test suites** (`engine.test.ts`, `recovery.test.ts`, `verify-ai.test.ts`, `routes.test.ts`, `geo.test.ts`, `camera.test.ts`, `predict.test.ts`).
- **Accessibility:** Keyboard Skip-to-Content link (`#main-content`), WCAG AA (`>= 4.5:1`) contrast palette (`#047857`, `#B91C1C`, `#1D4ED8`, `#475569` on `#FFFFFF`/`#FBFCFD`), `Escape`-key dismissal on popovers/inspectors/modals, `aria-live="polite"` telemetry announcements, full keyboard `role="button"`/`Enter`/`Space` operation on SVG map nodes, and `prefers-reduced-motion` support.

## Local Development, Tests & Deployment

```bash
pnpm install
pnpm test          # 57 Vitest unit & route tests across 7 test files
pnpm run typecheck # Strict TypeScript check (0 errors)
pnpm run verify    # Full typecheck + Vitest suite
pnpm run build     # Standalone Next.js production build
pnpm start         # http://localhost:3000
```

- **Vercel:** `npx vercel --prod` (runs on default Node.js Fluid Compute).
- **Google Cloud Run:** `gcloud run deploy domino-sky --source . --platform managed --allow-unauthenticated` (uses `Dockerfile` with `output: "standalone"` on `PORT=8080`).
