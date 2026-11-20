/**
 * Client-side simulator state hook encapsulating URL configuration parsing,
 * atomic scenario history undo stack, reduced-motion-aware RAF live clock,
 * throttled `/api/dispatch` fetch with abort cleanup, and action deduplication.
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { predictAllAirportFragilities } from "@/lib/ml/predict";
import {
  CLOCK_MAX, CLOCK_MIN, CLOSURE_MAX, CLOSURE_MIN, DATASET, getAirportById, parseHHMM,
} from "@/lib/sim/constants";
import { simulateNetwork } from "@/lib/sim/engine";
import { SCENARIO_PRESETS } from "@/lib/sim/presets";
import {
  areActionsCompatible, buildDeterministicBriefing, evaluateRecoveryCandidates,
} from "@/lib/sim/recovery";
import type {
  AirportClosure, DispatcherBriefing, RecoveryAction, RecoveryCandidate, RecoveryEvaluation,
} from "@/lib/sim/types";

/** Snapshot pushed before mutating closures or active recovery actions. */
export interface HistorySnapshot {
  closures: AirportClosure[];
  activeActions: RecoveryAction[];
  activePresetId: string;
}

/** Parsed URL bootstrap configuration for the OCC simulator view. */
export interface InitialSimulatorConfig {
  viewMode: "simple" | "advanced";
  presetId: string;
  clockMin: number;
  closures: AirportClosure[];
}

const DEFAULT_PRESET = SCENARIO_PRESETS[0];

function clampParam(raw: string | null, fallback: number, min: number, max: number): number {
  const num = raw ? Number(raw) : NaN;
  return Number.isFinite(num) ? Math.max(min, Math.min(max, Math.round(num))) : fallback;
}

/**
 * Parses and clamps URL query parameters (`view`, `preset`, `airport`, `start`, `dur`).
 *
 * @param searchParamsString - Serialized URL query string from `useSearchParams`.
 * @returns Sanitized simulator configuration clamped to operational IST windows.
 */
export function parseInitialConfig(searchParamsString: string): InitialSimulatorConfig {
  const params = new URLSearchParams(searchParamsString);
  const viewMode = params.get("view") === "advanced" ? "advanced" : "simple";
  const rawAirport = params.get("airport")?.trim().toUpperCase() ?? "";

  if (rawAirport && getAirportById(rawAirport)) {
    const startMin = clampParam(params.get("start"), 480, CLOSURE_MIN, CLOCK_MAX);
    const dur = clampParam(params.get("dur"), 90, 15, 360);
    const endMin = Math.min(CLOSURE_MAX, Math.max(startMin + 15, startMin + dur));
    return {
      viewMode,
      presetId: "custom",
      clockMin: Math.max(CLOCK_MIN, Math.min(CLOCK_MAX, startMin + 30)),
      closures: [{ id: `url-${rawAirport}`, airportId: rawAirport, startMin, endMin, label: `${rawAirport} Closure` }],
    };
  }

  const matched = SCENARIO_PRESETS.find((p) => p.id === params.get("preset")) ?? DEFAULT_PRESET;
  return { viewMode, presetId: matched.id, clockMin: matched.clockMin, closures: matched.closures };
}

/**
 * Manages full interactive state, simulation derivations, and dispatch fetching
 * for the Domino Sky OCC radar workspace.
 */
export function useSimulatorState() {
  const searchParams = useSearchParams();
  const initialConfig = useMemo(() => parseInitialConfig(searchParams.toString()), [searchParams]);

  const [viewMode, setViewMode] = useState<"simple" | "advanced">(initialConfig.viewMode);
  const [scenario, setScenario] = useState<HistorySnapshot>(() => ({
    closures: initialConfig.closures, activeActions: [], activePresetId: initialConfig.presetId,
  }));
  const [history, setHistory] = useState<HistorySnapshot[]>([]);
  const [clockMin, setClockMin] = useState<number>(initialConfig.clockMin);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [speed, setSpeed] = useState<number>(10);

  const [selectedFlightId, setSelectedFlightId] = useState<string | null>(null);
  const [selectedAirportId, setSelectedAirportId] = useState<string | null>(null);
  const [focusAirportSignal, setFocusAirportSignal] = useState<{ airportId: string; nonce: number } | null>(null);
  const [isStormDragging, setIsStormDragging] = useState<boolean>(false);
  const [isCrisisModalOpen, setIsCrisisModalOpen] = useState<boolean>(false);
  const [isDispatcherOpen, setIsDispatcherOpen] = useState<boolean>(true);
  const [showFragilityOverlay, setShowFragilityOverlay] = useState<boolean>(false);
  const [previewCandidate, setPreviewCandidate] = useState<RecoveryCandidate | null>(null);

  const initialEval = useMemo(() => evaluateRecoveryCandidates(initialConfig.closures, 5, []), [initialConfig.closures]);
  const [evaluation, setEvaluation] = useState<RecoveryEvaluation | null>(initialEval);
  const [briefing, setBriefing] = useState<DispatcherBriefing | null>(() => buildDeterministicBriefing(initialEval));
  const [dispatchMode, setDispatchMode] = useState<"ai_verified" | "deterministic_engine">("deterministic_engine");
  const [dispatchLoading, setDispatchLoading] = useState<boolean>(false);
  const dispatchAbortRef = useRef<AbortController | null>(null);
  const isFirstMountRef = useRef<boolean>(true);

  // Respect prefers-reduced-motion after hydration to avoid SSR/client mismatch.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches) setIsPlaying(false);
    const onChange = (e: MediaQueryListEvent) => { if (e.matches) setIsPlaying(false); };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (isFirstMountRef.current) { isFirstMountRef.current = false; return; }
    setViewMode(initialConfig.viewMode);
    setScenario({ closures: initialConfig.closures, activeActions: [], activePresetId: initialConfig.presetId });
    setHistory([]);
    setPreviewCandidate(null);
    setSelectedAirportId(null);
    setSelectedFlightId(null);
    setClockMin(initialConfig.clockMin);
  }, [initialConfig]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsCrisisModalOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!isPlaying) return;
    let rafId = 0;
    let lastTs = performance.now();
    const minsPerSec = speed === 30 ? 30 : speed === 10 ? 8 : 1.5;
    const tick = (now: number) => {
      const dtSec = Math.min(0.1, (now - lastTs) / 1000);
      lastTs = now;
      setClockMin((prev) => (prev + dtSec * minsPerSec >= CLOCK_MAX ? CLOCK_MIN : prev + dtSec * minsPerSec));
      rafId = window.requestAnimationFrame(tick);
    };
    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [isPlaying, speed]);

  const simulation = useMemo(() => simulateNetwork(scenario.closures, scenario.activeActions), [scenario]);
  const roundedClockMin = Math.round(clockMin);
  const airportFragilities = useMemo(
    () => (viewMode === "advanced" && showFragilityOverlay ? predictAllAirportFragilities(roundedClockMin, 90) : []),
    [viewMode, showFragilityOverlay, roundedClockMin]
  );

  const fetchDispatch = useCallback(async (targetClosures: AirportClosure[], actions: RecoveryAction[]) => {
    dispatchAbortRef.current?.abort();
    const controller = new AbortController();
    dispatchAbortRef.current = controller;
    const localEval = evaluateRecoveryCandidates(targetClosures, 5, actions);
    setEvaluation(localEval);
    setBriefing(buildDeterministicBriefing(localEval));
    if (targetClosures.length === 0 || localEval.candidates.length === 0) {
      setDispatchMode("deterministic_engine");
      setDispatchLoading(false);
      return;
    }
    setDispatchLoading(true);
    try {
      const res = await fetch("/api/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ closures: targetClosures, activeActions: actions }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error("Dispatch error");
      const data = await res.json();
      if (controller.signal.aborted) return;
      setEvaluation(data.evaluation);
      setBriefing(data.briefing);
      setDispatchMode(data.mode);
    } catch (err) {
      if ((err as Error).name !== "AbortError") setDispatchMode("deterministic_engine");
    } finally {
      if (!controller.signal.aborted) setDispatchLoading(false);
    }
  }, []);

  useEffect(() => {
    const handle = window.setTimeout(() => void fetchDispatch(scenario.closures, scenario.activeActions), 160);
    return () => { window.clearTimeout(handle); dispatchAbortRef.current?.abort(); };
  }, [scenario, fetchDispatch]);

  const commitScenario = (next: HistorySnapshot, nextClock?: number, clearSel = false) => {
    setHistory((prev) => [...prev.slice(-19), scenario]);
    setScenario(next);
    setPreviewCandidate(null);
    if (clearSel) { setSelectedAirportId(null); setSelectedFlightId(null); }
    if (nextClock !== undefined) setClockMin(nextClock);
  };

  const handleSelectPreset = (presetId: string) => {
    const preset = SCENARIO_PRESETS.find((p) => p.id === presetId);
    if (preset) commitScenario({ closures: preset.closures, activeActions: [], activePresetId: preset.id }, preset.clockMin, true);
  };

  const handleSaveClosure = (closure: AirportClosure) =>
    commitScenario(
      { closures: [...scenario.closures.filter((c) => c.airportId !== closure.airportId), closure], activeActions: [], activePresetId: "custom" },
      Math.min(CLOCK_MAX, closure.startMin + 35)
    );

  const handleRemoveClosure = (airportId: string) =>
    commitScenario({ closures: scenario.closures.filter((c) => c.airportId !== airportId), activeActions: [], activePresetId: "custom" });

  const handleDropStormOnAirport = (airportId: string) => {
    const flights = DATASET.flights.filter((f) => f.origin === airportId || f.destination === airportId);
    const earliest = flights.length ? Math.min(...flights.map((f) => parseHHMM(f.dep))) : parseHHMM("08:00");
    const startMin = Math.max(parseHHMM("07:00"), earliest + 15);
    handleSaveClosure({ id: `storm-${airportId}-${startMin}`, airportId, startMin, endMin: Math.min(CLOCK_MAX, startMin + 90), label: `${airportId} Storm` });
    setIsStormDragging(false);
    setSelectedAirportId(airportId);
  };

  const handleApplyCrisisClosures = (nextClosures: AirportClosure[]) => {
    const first = nextClosures[0];
    commitScenario({ closures: nextClosures, activeActions: [], activePresetId: "custom" }, first ? Math.min(CLOCK_MAX, first.startMin + 30) : undefined);
    setSelectedAirportId(null);
    if (first) setFocusAirportSignal({ airportId: first.airportId, nonce: Date.now() });
    setIsDispatcherOpen(true);
  };

  const handleApplyCandidate = (candidate: RecoveryCandidate) => {
    if (dispatchLoading) return;
    const existingIds = new Set(scenario.activeActions.map((a) => a.id));
    const compatibleNew = candidate.actions.filter(
      (nextAct) => !existingIds.has(nextAct.id) && scenario.activeActions.every((ex) => areActionsCompatible(ex, nextAct))
    );
    if (compatibleNew.length > 0) commitScenario({ ...scenario, activeActions: [...scenario.activeActions, ...compatibleNew] });
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    setScenario(history[history.length - 1]);
    setHistory((h) => h.slice(0, -1));
    setPreviewCandidate(null);
  };

  const handleReset = () => {
    if (scenario.closures.length > 0 || scenario.activeActions.length > 0) {
      commitScenario({ closures: [], activeActions: [], activePresetId: "clear-skies" }, undefined, true);
    }
  };

  return {
    viewMode, setViewMode, ...scenario, canUndo: history.length > 0, clockMin, isPlaying, speed,
    selectedFlightId, setSelectedFlightId, selectedAirportId, setSelectedAirportId,
    focusAirportSignal, focusAirport: useCallback((aid: string) => setFocusAirportSignal({ airportId: aid, nonce: Date.now() }), []),
    isStormDragging, setIsStormDragging, isCrisisModalOpen, setIsCrisisModalOpen,
    closeCrisisModal: useCallback(() => setIsCrisisModalOpen(false), []),
    isDispatcherOpen, setIsDispatcherOpen, showFragilityOverlay, setShowFragilityOverlay,
    previewCandidate, setPreviewCandidate, evaluation, briefing, dispatchMode, dispatchLoading,
    simulation, airportFragilities,
    selectedAirport: selectedAirportId ? getAirportById(selectedAirportId) : undefined,
    selectedFlight: selectedFlightId ? simulation.flightsById[selectedFlightId] : undefined,
    handleSelectPreset, handleSaveClosure, handleRemoveClosure, handleDropStormOnAirport,
    handleApplyCrisisClosures, handleApplyCandidate, handleUndo, handleReset,
    handleChangeClock: useCallback((min: number) => { setIsPlaying(false); setClockMin(min); }, []),
    handleTogglePlay: useCallback(() => setIsPlaying((p) => !p), []),
    handleCycleSpeed: useCallback(() => setSpeed((s) => (s === 1 ? 10 : s === 10 ? 30 : 1)), []),
    clearSelectedFlight: useCallback(() => setSelectedFlightId(null), []),
    clearSelectedAirport: useCallback(() => setSelectedAirportId(null), []),
    refreshDispatch: () => void fetchDispatch(scenario.closures, scenario.activeActions),
  };
}
