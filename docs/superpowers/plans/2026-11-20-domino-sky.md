# Domino Sky Implementation Plan

> **For agentic workers:** Follow `ponytail` minimalism (YAGNI, zero speculative abstractions) and `AntiSlopUI` v3.0.0 gates strictly. Make clean, incremental git commits per task (Stage 1 Git authenticity requirement).

**Goal:** Build and iteratively polish **Domino Sky**, a FlightRadar24-style Airline OCC disruption simulator and zero-hallucination AI recovery dispatcher for the 16-airport Indian network, ready for live Vercel and Cloud Run deployment.

**Architecture:** Next.js App Router (TypeScript + Tailwind CSS v4) with a shared pure-TypeScript fixed-point deterministic simulation & recovery engine (`src/lib/sim/`), two Node.js API routes (`/api/dispatch` and `/api/parse-crisis`) using Vercel AI SDK with a regex allow-list hallucination verifier and instant offline fallback, and an interactive aspect-corrected India SVG radar map synchronized with a scrollable Tail-Chain Gantt and flex-docked AI Dispatcher drawer.

**Tech Stack:** Next.js (App Router, `output: 'standalone'`, Node 24 LTS), React 19, TypeScript, Tailwind CSS v4, `lucide-react`, `zod`, `ai`, `@ai-sdk/google`, `vitest`.

**Spec:** `docs/superpowers/specs/2026-11-20-domino-sky-design.md`

---

## Global Constraints
- **Vercel & Cloud Run Runtime:** Default Node.js Fluid Compute / standalone server — NEVER add `export const runtime = 'edge'`. Check `node_modules/ai/docs/` and `node_modules/next/dist/docs/` after install; use `generateText` with `output: Output.object({ schema })` (never deprecated `generateObject`).
- **AntiSlopUI v3.0 Hard Gates:** Zero purple/indigo/violet accents, zero gradient-text headlines, zero glassmorphism/`backdrop-blur`, zero `hover:scale-*`, zero emoji icons (`lucide-react` only), zero `rounded-full` pill spam (`rounded-sm` aviation tags, `rounded-md` buttons), zero typewriter text animations, full `prefers-reduced-motion` support, contrast ≥ 4.5:1 body (`#F87171` for crimson text, NEVER `#EF4444` text on dark), color never the sole state indicator, distinctive display (`Bricolage Grotesque`) + body (`IBM Plex Sans`) + data mono (`JetBrains Mono` strictly for callsigns/times/KPIs, never display headings).
- **Zero Hallucination & Exact Dataset:** Use the exact 16 airports, 70 flights, 21 connections, 16 crews, and 2 spares supplied in the conversation. Every AI prose number/ID is verified server-side via regex allow-list; every UI number binds directly to deterministic structs.
- **Stage 1 Git Authenticity:** Make clean incremental commits after every task.

---

## Tasks
- **Task 0:** Plan save, Git init, Next.js scaffold (`output: 'standalone'`, Cloud Run `Dockerfile`), `npm install`, exact dataset (`src/data/domino-sky-dataset.json`), India GeoJSON (`src/data/india-geo.json`), `src/lib/geo.ts` (`cos(22°)` projection, arcs, bearing interpolation, ATC holding orbit, non-colliding label offsets).
- **Task 1:** Deterministic cascade engine (`src/lib/sim/types.ts`, `engine.ts`, `engine.test.ts`) with fixed-point loop, turnaround-before-closure, buffer absorption, ATC airborne holding, reserve crew clock, inclusion-exclusion pax.
- **Task 2:** Recovery evaluator (`recovery.ts`), AI allow-list verifier (`verify-ai.ts`), deterministic crisis parser (`parse-crisis.ts`), and TDD unit tests (`recovery.test.ts`).
- **Task 3:** Vercel/Cloud Run Node.js API routes (`/api/dispatch`, `/api/parse-crisis`).
- **Task 4:** AntiSlopUI Design System (`layout.tsx`, `globals.css`), `TopTelemetryBar.tsx`, `CrisisCommandBar.tsx`, `RadarMap.tsx`, `AirportClosurePopover.tsx`, `FlightInspector.tsx`, `TimelineScrubber.tsx`.
- **Task 5:** `TailChainGantt.tsx`, `AiDispatcherDrawer.tsx`, `page.tsx`, `README.md`.
- **Task 6:** Static checks, live Playwright visual inspection at `1280×800` and `1440×900`, all 4 stress tests, Goldfish code & AntiSlopUI audit, iterative polish, and final report.
