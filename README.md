# Domino Sky — Flight Disruption Cascade & Recovery Simulator

**Live Demo:** [https://domino-sky-henna.vercel.app](https://domino-sky-henna.vercel.app)

Domino Sky is a deterministic Airline Operations Control Center (OCC) disruption cascade simulator and verified recovery workbench for a 16-airport Indian aviation network.

## Chosen Vertical
**Domino Sky: Airline Operations Control Center (OCC) Disruption & Recovery Simulator** across a 16-airport Indian flight network (`70` scheduled flights, `16` aircraft tail chains, `21` passenger connections, `16` crew duty rosters, and `2` standby spare aircraft at `BLR` and `DEL`).

## Approach & Logic
All delay, crew legality, and stranded-passenger numbers are calculated **100% deterministically** by pure TypeScript simulation code—never guessed by an LLM:

1. **Fixed-Point Tail-Chain Cascade (`src/lib/sim/engine.ts`):**
   - Evaluates `min_turnaround_minutes = 30` and computes exact `bufferAbsorbedMin` per leg *before* checking airport closure holds (`[startMin, endMin)`), preventing late inbound flights from operating into or out of a closed hub.
   - Models Ground Delay Program (GDP) holds vs. airborne ATC holding orbits (`holdingStartMin`–`holdingEndMin`).
   - Enforces the `600`-minute crew legal duty limit (`CREW_BREACH`), grounding breached legs and excluding them from operated delay counts.
   - Uses exact inclusion-exclusion to prevent double-counting connecting passengers when both `from_flight` and `to_flight` are grounded.
2. **Physically Valid Recovery, What-If Query Engine & AI Verifier (`src/lib/sim/recovery.ts`, `src/lib/sim/verify-ai.ts`):**
   - Evaluates single-use spare aircraft swaps (`VT-DS17` at `BLR`, `VT-DS18` at `DEL` with fresh reserve crew clock `takeoverDep - 30m` still bound by `600m`), physically legal cancellations (tail last leg or matched `A→B` + `B→A` round-trip pairs — zero aircraft teleportation), `<=45m` hub connection holds, and incremental follow-on recoveries.
   - `answerDispatcherQuery` resolves live `+30m` storm-extension cliff checks, worst domino chain traces, flight/tail lookups, and plain-English storm probes deterministically.
   - `/api/dispatch` runs a regex allow-list verifier (`verifyAiBriefing`) over every integer, flight ID, tail ID, crew ID, and connection ID in LLM output, falling back automatically if any token drifts.
3. **Simulation-Trained Surrogate ML (`scripts/train-risk-model.ts`, `src/lib/ml/predict.ts`):**
   - Trained offline across `3,000` deterministic simulation runs (`80/20` split) using Ridge Regression (`R² = 0.651`, `MAE = 11.62`) for `0–100` pre-storm hub fragility and L2 Logistic Regression (`ROC-AUC = 0.914`) for `+30m` storm-extension crew-breach risk, serving `<1ms` pure-TS inference with zero conflict with deterministic counts.

## How the Solution Works
- **`/` (Kinetic Story):** Anime.js-choreographed landing page with a live sculpted relief map of India where users toggle live weather environments (*Mumbai Monsoon*, *Delhi Winter Fog*, *Guwahati Spoke*, *Dual-Hub Crisis*) and explore interactive modules covering tail-chain cascades, ML fragility, and verified recovery.
- **`/simulator` (Top-Down Spatial OCC Simulator):** Alabaster Dribbble-inspired pan-and-zoom India map with live `requestAnimationFrame` aircraft motion by default, borderless floating 2×2 flight statistics, collapsible airport & disrupted-tail drawer, `15–240m` storm duration slider, `Simple` and `Advanced` (`TailChainGantt` + Hub Fragility Rings) modes, `⌘K` plain-English crisis compiler (`/api/parse-crisis`), Before/After ghost diff overlays, and interactive AI Dispatcher ask/what-if console + `Undo`.
- **`/about` (Methodology & Verification):** Architecture, mathematical cascade guarantees, ML model evaluation summary, and live stress-test documentation.

## Assumptions Made
- Single operating day (`05:30–22:30 IST`); closures are evaluated as half-open intervals `[startMin, endMin)`.
- Standby reserve crews on `VT-DS17` (`BLR`) and `VT-DS18` (`DEL`) begin their `600`-minute duty clock `30` minutes prior to takeover departure (`takeoverDep - 30m`), and each physical spare aircraft can be assigned at most once.
- Only final legs or matched `A→B` + `B→A` round-trip spoke pairs may be cancelled so aircraft stay physically positioned for downstream legs.
- Without `AI_GATEWAY_API_KEY` or `GEMINI_API_KEY`, `/api/dispatch` and `/api/parse-crisis` run transparently in deterministic engine mode with full functionality.

## Engineering Quality & Safeguards
- **Security:** Strict Zod schema validation (`VALID_IATA` enum, integer window bounds, `endMin > startMin` refinement, bounded string/array lengths), dedicated `400` malformed-JSON error guards on `/api/dispatch` and `/api/parse-crisis`, separate `system` vs. user `prompt` isolation against prompt injection, and hardened `Content-Security-Policy`, `Permissions-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, and `Referrer-Policy` headers in `next.config.ts`.
- **Efficiency:** Precomputed/memoized SVG relief geometry and per-airport status maps, visibility- and offscreen-aware `requestAnimationFrame` animation loops (`HeroFlightCanvas` / `AnimeHeroDial` / `/simulator` live clock), and conditional ML fragility computation executed only when `Advanced` + `Hub Fragility Rings` is enabled.
- **Accessibility:** WCAG AA (`>= 4.5:1`) contrast across all text, badges, and interactive controls (`#047857`, `#B91C1C`, `#1D4ED8`, `#475569` on `#FFFFFF`/`#FBFCFD`), full keyboard navigation (`role="button"`, `tabIndex={0}`, `Enter`/`Space` activation, descriptive `aria-label`s) across interactive SVG airport beacons, aircraft, holding pills, and chain nodes, `aria-pressed`/`aria-expanded`/`aria-current` states, and `prefers-reduced-motion` support.
- **Code Quality & Problem Statement Alignment:** Strict TypeScript (`tsc --noEmit`) across modular pure-TypeScript simulation/ML engines decoupled from Next.js Route Handlers and UI layers, enforcing exact turnaround buffer absorption, `600m` crew duty cutoffs, inclusion-exclusion stranded passenger accounting, physical tail-positioning invariants, and zero-hallucination AI verification.

## Local Development, Tests & Deployment

```bash
pnpm install
pnpm test          # 29+ Vitest unit & route tests (engine, recovery, what-if queries, API validation/security, verifier, ML)
pnpm run typecheck # Strict TypeScript check
pnpm run verify    # Full typecheck + Vitest suite
pnpm run build     # Standalone Next.js production build
pnpm start         # http://localhost:3000
```

- **Vercel:** `npx vercel --prod` (runs on default Node.js Fluid Compute).
- **Google Cloud Run:** `gcloud run deploy domino-sky --source . --platform managed --allow-unauthenticated` (uses `Dockerfile` with `output: "standalone"` on `PORT=8080`).
