# Domino Sky — Technical & Visual Design Specification

**Date:** 2026-11-20  
**Status:** Goldfish-Reviewed — Ready for Human Approval  
**Target Platform:** Vercel (Next.js App Router, Node.js Fluid Compute)  
**UI Craft Contract:** `Vanszs/AntiSlopUI` v3.0.0 (Zero P0 tells, < 3 P0/HIGH tells)

---

## 1. Intent & Why

**Domino Sky** is an interactive airline Operations Control Center (OCC) disruption simulator and AI recovery dispatcher for a 16-airport Indian flight network. A user closes one or more airports for chosen time windows (by dragging a radar storm cell onto an airport, clicking an airport, or typing a plain-English crisis) and watches delays propagate deterministically across 70 flights, 16 aircraft tail chains, 21 passenger connections, and 16 crew duty clocks.

The experience must feel like **FlightRadar24 built for an airline operations dispatcher**: tactile, high-information-density, instant (`< 5ms` recalculation), and completely free of generic "AI dashboard slop." Every number displayed in the UI or spoken by the AI Dispatcher is guaranteed to match our deterministic simulation engine—enforced by both data-binding and a server-side post-generation verifier.

### Goals (Aligned to 100-Point Judging Rubric & 4 Live Stress Tests)
- **Memorable Operator Interaction Metaphor (Innovation — 25 pts):**
  - **Draggable Radar Storm Cells** that snap onto *any* of the 16 airports, with native support for **multi-storm / chained closures** (e.g., `BOM` + `DEL` simultaneously).
  - **ATC Holding-Pattern Radar Rings:** Inbound aircraft destined for a closed airport visibly orbit in an animated racetrack holding pattern around the closed airport until reopening; ground-held departures pulse on the tarmac with a live hold timer.
  - **Live Tail-Number Domino Tracks + Buffer Absorption Gauges:** Selecting any flight illuminates its entire 4–5 leg tail chain on both radar and Gantt, showing exact turnaround slack absorbed (e.g., `70m turnaround → absorbed 20m → 0m cascade`) vs. shattered (`35m turnaround → SHATTERED → +85m cascade`).
- **Deterministic Multi-Layer Cascade Engine (Problem-Solving — 25 pts):**
  - Passes **Stress Test #1 (20m vs. 110m Buffer Absorption)**, **Stress Test #2 (Hub vs. Spoke e.g., `GAU`/`TRV`)**, and **Stress Test #3 (Live Recovery Delta + 1-Click Undo/Reset)** deterministically.
- **Load-Bearing Zero-Hallucination AI (AI & Prompting — 20 pts):**
  - **Plain-English Crisis Compiler (`/api/parse-crisis`):** Compiles natural-language disruptions (e.g., *"Monsoon closes Mumbai 8am–9:30am and fog hits Delhi 10am–11am"*) into structured `AirportClosure[]` mutations with an offline deterministic parser fallback.
  - **Grounded AI Recovery Dispatcher (`/api/dispatch`):** Runs the shared deterministic engine server-side for *any* unscripted storm (passes **Stress Test #4**), evaluates Spare Swap, Physically-Valid Cancellation, and Hub Connection Hold, verifies LLM prose tokens via regex against the deterministic allow-list, and provides **1-Click Preview Ghost Diff**, **1-Click Apply**, and **1-Click Undo**.
- **Strict AntiSlopUI v3.0 & Stage 1 Compliance (Execution & UX — 30 pts):**
  - Deployed live on Vercel with clean incremental Git commits, zero console crashes, `< 10s` judge clarity, and verified `AntiSlopUI` contrast/typography/motion compliance.

### Non-Goals
- Multi-day schedule rollovers (the dataset is a single operating day in IST).
- Live external ADS-B or third-party weather API dependencies that could fail on stage.
- User authentication or database persistence.

### Anti-Goals
- **AI Slop Aesthetics:** Purple/indigo accents, floating glassmorphic navbars, `Inter` everywhere, `hover:scale-*`, emoji icons, `rounded-full` pills everywhere, or generic 3-card SaaS grids.
- **Hallucinated AI Numbers:** Any mismatch between AI prose and deterministic engine totals.
- **Aircraft Teleportation or Double-Counted Pax:** Cancelling an intermediate single leg without its return leg, or double-counting connecting passengers when both legs are grounded.

---

## 2. Approaches Considered

| Approach | Summary | Trade-offs | Decision |
|---|---|---|---|
| **A. Full-Bleed OCC Radar + Collapsible Tail-Chain Gantt + Flex-Docked AI Dispatcher** | Full-screen dark tactical vector map of India (embedded aspect-corrected GeoJSON, zero tile dependency), draggable storm cells, ATC holding patterns, scrollable `28px` Tail-Chain Gantt, and right-hand AI Dispatcher that flex-resizes the map so East India stays clickable. | Requires tight clock/Gantt/ghost synchronization, but delivers authentic FlightRadar24-for-OCC craft at 60fps. | **Selected** |
| **B. 50/50 Split Radar + Causal DAG** | Map on left half, node-link domino tree on right. | Explicit causality, but cramps the map into half the screen and feels like a BI dashboard. | Rejected |
| **C. 3D Tilted Globe / Altitude Arcs** | Three.js/WebGL 3D India terrain with elevated parabolas. | High initial flash, but callsigns overlap, airport clicking is finicky on trackpads, and GPU load risks stutter on demo projectors. | Rejected |

---

## 3. Dataset & Deterministic Simulation Engine

Dataset stored at `src/data/domino-sky-dataset.json`: `16` airports, `70` flights across `16` tails (`VT-DS01`..`VT-DS16`), `21` connections (`CX01`..`CX21`), `16` crews (`CR01`..`CR16`, `max_duty_mins: 600`), and `2` spares (`VT-DS17` at `BLR`, `VT-DS18` at `DEL`, available `05:00`, `180` seats).

### 3.1 Deterministic Propagation Rules (`src/lib/sim/engine.ts`)
All times are integer minutes from `00:00 IST`. `simulateNetwork(closures: AirportClosure[], actions: RecoveryAction[])` runs in a **fixed-point convergence loop** (max 5 passes, stabilizes in 2–3 passes, `< 0.5ms`) so cross-tail `HOLD_CONNECTION` actions propagate accurately regardless of tail ordering.

Within each pass, for each tail (`VT-DS01`..`VT-DS16`) in `leg_order`:
1. **Cancelled Leg Skip:** If the leg is cancelled by an active `CANCEL_FLIGHT` action, mark `status = 'CANCELLED'` and do **not** update `prevOperatedLeg` (subsequent legs inherit turnaround from the last *operated* leg).
2. **Spare Takeover Switch:** If an active `SWAP_SPARE` targets this leg (at the spare's base `BLR` or `DEL`), switch the active aircraft to the spare tail (`VT-DS17`/`VT-DS18`), reset `prevOperatedLeg = null`, and initialize a fresh reserve crew with `duty_start = max(scheduledDep, closureReleaseIfAny) - 30` (30-min preflight briefing) and `max_duty_mins = 600`.
3. **Turnaround Propagation & Buffer Absorption (Evaluated BEFORE Closure Holds):**
   - If `prevOperatedLeg` exists:
     - `scheduledTurnaround = scheduledDep - prevOperatedLeg.scheduledArr`
     - `turnaroundBuffer = scheduledTurnaround - 30` (`min_turnaround_minutes`)
     - `earliestDepFromInbound = prevOperatedLeg.actualArr + 30`
     - `inboundDelay = max(0, prevOperatedLeg.actualArr - prevOperatedLeg.scheduledArr)`
     - `bufferAbsorbedMin = min(inboundDelay, max(0, turnaroundBuffer))`
     - `readyDep = max(scheduledDep, earliestDepFromInbound)`
   - Else: `readyDep = scheduledDep`, `bufferAbsorbedMin = 0`.
4. **Connection Hold Action (`HOLD_CONNECTION`):**
   - If an active hold targets this flight for connection `CX`, and `from_flight` is operated (not cancelled/breached), set `readyDep = max(readyDep, from_flight.actualArr + cx.min_connect_minutes)`.
5. **Airport Closure Holds (Multi-Storm Support — Evaluated AFTER Turnaround so delayed flights cannot illegally fly into/out of a closed airport):**
   - Loop until `readyDep` and `readyDep + block_minutes` are clear of all active `closures`:
     - **Departure Hold:** If any closure on `origin` satisfies `readyDep >= c.startMin && readyDep < c.endMin`, push `readyDep = c.endMin` (`PRIMARY_WEATHER_DEP_HOLD`).
     - **Arrival Hold (ATC Holding / GDP):** If any closure on `destination` satisfies `readyDep + block_minutes >= c.startMin && readyDep + block_minutes < c.endMin`, record airborne holding / GDP delay pushing arrival to `c.endMin` (`actualArr = c.endMin`, `actualDep = readyDep` if already airborne at `c.startMin` else held to `c.endMin - block_minutes`) (`PRIMARY_WEATHER_ARR_HOLD`).
6. **Crew Duty Legality (`max_duty_mins = 600`):**
   - Compute `dutyLimitMin = activeCrew.dutyStartMin + 600`.
   - If `actualArr > dutyLimitMin` (or an earlier leg on the *same* active crew already breached), mark `status = 'CREW_BREACH'` (`crewOvertimeMin = actualArr - dutyLimitMin`). That flight is legally grounded and does not operate.
7. **Status & KPI Rules:**
   - Flight statuses: `ON_TIME` (`delayMin === 0`), `DELAYED` (`delayMin > 0`, operated), `CREW_BREACH` (grounded), `CANCELLED` (grounded by recovery).
   - **KPI Definitions (Clean Separation):**
     - `delayedFlightsCount` and `totalDelayMinutes` count **operated** `DELAYED` flights only (`CREW_BREACH` and `CANCELLED` are tracked separately in `crewBreachesCount` and `cancelledFlightsCount`).
     - **Exact Deduplicated Stranded Passengers (Inclusion-Exclusion):**
       - `groundedPax = sum(f.pax for f where status in ['CANCELLED', 'CREW_BREACH'])`
       - `dualGroundedOverlap = sum(cx.passengers where BOTH from_flight and to_flight are grounded)`
       - `missedConnectionPax = sum(cx.passengers where NEITHER flight is grounded AND to_flight.actualDep - from_flight.actualArr < cx.min_connect_minutes)`
       - `totalStrandedPax = groundedPax - dualGroundedOverlap + missedConnectionPax`

### 3.2 Deterministic Recovery Evaluator (`src/lib/sim/recovery.ts`)
Enumerates and simulates all physically valid recovery actions in `< 15ms`:
1. **`SWAP_SPARE` (`VT-DS17` at `BLR`, `VT-DS18` at `DEL`):** Eligible for any delayed or `CREW_BREACH` leg departing from `BLR` or `DEL` (respecting any active closure at `BLR`/`DEL` and verifying the reserve crew's 600-min duty limit on all remaining legs).
2. **`CANCEL_FLIGHT` (Physically Valid Positioning Only):** Only allows cancelling either (a) the **last remaining leg** of a tail, or (b) a **matched out-and-back spoke pair** (`leg k: A→B` + `leg k+1: B→A`) so aircraft positioning stays 100% physically valid with zero teleportation.
3. **`HOLD_CONNECTION`:** Eligible for any time-broken connection where `from_flight` is operated, `to_flight` is not breached, and holding `to_flight` by `neededHoldMin <= 45` does not trigger a new crew breach.
4. **Top 2-Action Combinations:** Pairs top non-conflicting single actions (max 1 action per tail, no reusing the same spare, no holding a cancelled flight).
- **Transparent Ranking Objective:** Minimize `(totalStrandedPax, crewBreachesCount, totalDelayMinutes)`.

---

## 4. Zero-Hallucination AI Architecture (Vercel Node.js Fluid Compute)

1. **`POST /api/parse-crisis` (Plain-English Crisis Compiler):**
   - Takes user text (e.g., *"90 min thunderstorm in Mumbai at 7:30am and Delhi fog 10am to 11am"*).
   - Uses Vercel AI SDK (`generateObject` with strict Zod schema over the 16 valid IATA codes and `05:00–22:00` IST) on Node.js Fluid Compute, with an instant deterministic regex/city-name parser fallback if no API key is configured.
2. **`POST /api/dispatch` (Grounded AI Dispatcher + Post-Generation Verifier):**
   - Runs `simulateNetwork()` and `evaluateRecoveryCandidates()` deterministically on the server for the exact active `closures`.
   - Passes the baseline summary + top 5 verified candidate plans to the LLM (`google/gemini-2.5-flash` via Vercel AI Gateway, or configured provider key) to return structured JSON (`recommendedActionId`, `executiveSummary`, `tradeoffAnalysis`, `perOptionNotes`).
   - **Server-Side Post-Generation Verifier:** Regex-extracts every integer, flight ID (`DS\d{4}`), tail ID (`VT-DS\d{2}`), and connection ID (`CX\d{2}`) from all LLM prose fields and verifies every token exists in the deterministic payload's allow-list (and `recommendedActionId` is valid). If *any* ungrounded number/ID appears (or if no API key is set), the route seamlessly returns the deterministic briefing template with an explicit `mode: 'ai_verified' | 'deterministic_engine'` badge.
   - **UI Numeric Lock:** Every KPI badge, delta readout, and flight count in the drawer is bound strictly to the deterministic `CandidateResult` struct.

---

## 5. Visual Design System & AntiSlopUI v3.0 Compliance

### 5.1 Contrast-Verified Matte Cockpit Palette (Zero Purple/Indigo, Zero Glassmorphism)
- **Surfaces:**
  - Radar Ocean: `#090D12` · India Landmass: `#111821` · Coastline/Border: `#243244`
  - Solid Panels & Top Bar & Scrubber: `#11161D` with `1px solid #222C38` hairline borders (zero `backdrop-blur` glassmorphism).
  - Elevated Surface / Row: `#18202A` · Hover: `#1F2937`
- **Text (All ≥ 4.5:1 Verified):**
  - Primary Text: `#F1F5F9` (`15.9:1` on `#11161D`)
  - Secondary Text: `#94A3B8` (`6.4:1` on `#11161D`)
  - Crimson Alert Text: `#F87171` (`red-400`, `6.8:1` on `#18202A` — fixes `#EF4444` text contrast fail!)
  - Amber Warning Text: `#FBBF24` (`amber-400`, `10.8:1` on `#18202A`)
  - Emerald Nominal Text: `#34D399` (`emerald-400`, `9.2:1` on `#18202A`)
- **Non-Text UI Strokes / Icons / Badges (≥ 3:1 Verified):**
  - Primary Action Button: Solid Aviation Amber `#F59E0B` with `#090D12` text (`10.1:1`).
  - Storm / Breach Strokes & Icons: `#EF4444` · Delayed Strokes: `#F59E0B` · On-Time Strokes: `#10B981` · Ghost Reference Vectors (non-text only): dashed `#64748B`.
- **Redundant State Encoding:** Colour is *never* the sole indicator — every status pairs colour + `lucide-react` icon + crisp rectangular `rounded-sm` code (`ON TIME`, `+85m`, `CREW BREACH`, `CANCELLED`).

### 5.2 Typography
- **Display (`--font-display`):** `Bricolage Grotesque` (600/700) — solid high-contrast wordmark & panel titles (zero gradient text).
- **Body (`--font-sans`):** `IBM Plex Sans` (400/500/600) — controls, labels, dispatcher explanations.
- **Data (`--font-mono`):** `JetBrains Mono` (400/500) — strictly for IATA codes, flight IDs, tail IDs, timestamps, and `tabular-nums` KPIs (never used as display headings).

### 5.3 Layout, Map Engineering & Breakpoints (1280px & 1440px Safe)
- **Top Telemetry Bar (Fixed Solid `h-14`, `border-b`):**
  - Left: `DOMINO SKY` wordmark + compact **`Scenario ▾` dropdown** (`BOM 90m Storm`, `BOM 20m Buffer Test`, `BOM + DEL Dual Crisis`, `HYD 75m`, `GAU Spoke`, `Clear Skies`) + **Plain-English Crisis Input** trigger (`⌘K` / inline compact bar) + **Draggable Storm Cell** token (`Drag onto any airport`).
  - Center: Inline tabular KPI strip (`Delayed`, `Stranded Pax`, `Crew Breaches`, `Total Delay`) with live Before → After deltas when previewing or applying recovery + **Undo / Reset** button.
  - Right: `AI Dispatcher` toggle button.
- **Main Workspace (Flex Row — Map Flex-Resizes When AI Drawer Opens):**
  - **Radar Map (~66% height):** Aspect-corrected India projection (`cos(22°)` scaling so India is never stretched) with explicit per-airport `labelOffset: { dx, dy, anchor }` table in `src/lib/geo.ts` so close pairs (`BOM`/`PNQ`, `COK`/`TRV`, `DEL`/`IXC`/`JAI`, `BLR`/`MAA`) and spare badges (`VT-DS17`, `VT-DS18`) never collide.
  - **Flight Inspector:** Anchored **top-left** of the radar map (zero collision with right-hand `380px` AI Dispatcher) showing the selected flight's causal domino chain + turnaround buffer absorption math.
  - **Bottom-Center Solid Matte Day Clock Scrubber:** `05:30–22:30 IST`, Play/Pause, `1x / 10x / 30x` speed, `aria-valuetext` in `HH:MM IST`.
- **Bottom Tail-Chain Gantt (~34% height, collapsible):**
  - Fixed `28px` rows inside a vertically scrollable container with a sticky time header, sorted **Disrupted Tails First** so affected tails are immediately visible on 720p/1080p screens.
  - Renders `ORG→DST` bars, hatched delay blocks, green buffer-absorbed markers, red vertical `duty_start + 600m` legality walls, and broken connection markers.

### 5.4 Motion & Accessibility (`AntiSlopUI`)
- Hover transitions: `120ms` color/border only (**zero `hover:scale-*`**).
- Drawer/popover transitions: `200ms` `transform`/`opacity`.
- **Zero typewriter animation** on AI text.
- **`prefers-reduced-motion`:** Disables radar storm pulse and holding-pattern spin; renders static aircraft positions at current scrubber clock.
- All interactive elements: `lucide-react` icons (zero emoji), `rounded-md`/`rounded-lg` buttons & `rounded-sm` status tags (no pill spam), `cursor-pointer`, explicit `<label>`/`aria-label`, visible `focus-visible:ring-2 focus-visible:ring-amber-400`.

---

## 6. Project Structure & Tech Stack

- **Framework:** Next.js (App Router) + React + TypeScript + Tailwind CSS v4
- **Icons:** `lucide-react` · **Validation:** `zod` · **AI:** `ai` (Vercel AI SDK) · **Tests:** `vitest`

```text
src/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── globals.css
│   └── api/
│       ├── dispatch/route.ts       # Node.js Fluid Compute AI Dispatcher + regex verifier
│       └── parse-crisis/route.ts   # Plain-English crisis -> AirportClosure[] compiler
├── data/
│   ├── domino-sky-dataset.json     # Exact organiser dataset
│   └── india-geo.json              # Simplified aspect-accurate India GeoJSON
├── lib/
│   ├── sim/
│   │   ├── types.ts
│   │   ├── engine.ts               # Fixed-point deterministic cascade + buffer absorption
│   │   ├── recovery.ts             # Spare swap, valid pair cancel, connection hold + combos
│   │   ├── verify-ai.ts            # Post-generation numeric/ID allow-list verifier
│   │   └── engine.test.ts          # Vitest suite covering all 4 live stress tests
│   └── geo.ts                      # cos(22°) projection, label offsets, holding-pattern orbits
└── components/
    ├── TopTelemetryBar.tsx
    ├── CrisisCommandBar.tsx
    ├── RadarMap.tsx
    ├── FlightInspector.tsx
    ├── AirportClosurePopover.tsx
    ├── TimelineScrubber.tsx
    ├── TailChainGantt.tsx
    └── AiDispatcherDrawer.tsx
```
