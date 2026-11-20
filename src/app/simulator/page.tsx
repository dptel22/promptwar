"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronDown, ChevronUp, CloudLightning, Layers, Plane } from "lucide-react";
import { AiDispatcherDrawer } from "@/components/AiDispatcherDrawer";
import { AirportClosurePopover } from "@/components/AirportClosurePopover";
import { CrisisCommandModal } from "@/components/CrisisCommandModal";
import { FlightInspector } from "@/components/FlightInspector";
import { RadarMap } from "@/components/RadarMap";
import { TailChainGantt } from "@/components/TailChainGantt";
import { CLOCK_MAX, CLOCK_MIN, TimelineScrubber } from "@/components/TimelineScrubber";
import { SCENARIO_PRESETS, TopTelemetryBar } from "@/components/TopTelemetryBar";
import { predictAllAirportFragilities } from "@/lib/ml/predict";
import { DATASET, getAirportById, parseHHMM, simulateNetwork } from "@/lib/sim/engine";
import {
  areActionsCompatible,
  buildDeterministicBriefing,
  evaluateRecoveryCandidates,
} from "@/lib/sim/recovery";
import type {
  AirportClosure,
  DispatcherBriefing,
  RecoveryAction,
  RecoveryCandidate,
  RecoveryEvaluation,
} from "@/lib/sim/types";

interface HistorySnapshot {
  closures: AirportClosure[];
  activeActions: RecoveryAction[];
  activePresetId: string;
}

const DEFAULT_PRESET = SCENARIO_PRESETS[0];

function parseConfigFromParams(searchParamsString: string) {
  const params = new URLSearchParams(searchParamsString);
  const viewParam = params.get("view") === "advanced" ? "advanced" : "simple";
  const airportParam = params.get("airport");
  const startParam = Number(params.get("start"));
  const durParam = Number(params.get("dur"));

  if (airportParam && getAirportById(airportParam)) {
    const startMin = Number.isFinite(startParam)
      ? Math.max(300, Math.min(1350, Math.round(startParam)))
      : 480;
    const dur = Number.isFinite(durParam)
      ? Math.max(15, Math.min(360, Math.round(durParam)))
      : 90;
    const endMin = Math.min(1380, startMin + dur);

    return {
      viewMode: viewParam as "simple" | "advanced",
      presetId: "custom",
      clockMin: Math.min(CLOCK_MAX, startMin + 30),
      closures: [
        {
          id: `url-${airportParam}`,
          airportId: airportParam,
          startMin,
          endMin,
          label: `${airportParam} Closure`,
        },
      ] as AirportClosure[],
    };
  }

  const presetParam = params.get("preset");
  const matched =
    SCENARIO_PRESETS.find((p) => p.id === presetParam) ?? DEFAULT_PRESET;
  return {
    viewMode: viewParam as "simple" | "advanced",
    presetId: matched.id,
    clockMin: matched.clockMin,
    closures: matched.closures,
  };
}

function SimulatorContent() {
  const searchParams = useSearchParams();
  const searchParamsKey = searchParams.toString();

  const initialConfig = useMemo(
    () => parseConfigFromParams(searchParamsKey),
    [searchParamsKey]
  );

  const [viewMode, setViewMode] = useState<"simple" | "advanced">(
    initialConfig.viewMode
  );
  const [closures, setClosures] = useState<AirportClosure[]>(
    initialConfig.closures
  );
  const [activeActions, setActiveActions] = useState<RecoveryAction[]>([]);
  const [activePresetId, setActivePresetId] = useState<string>(
    initialConfig.presetId
  );
  const [history, setHistory] = useState<HistorySnapshot[]>([]);

  const [clockMin, setClockMin] = useState<number>(initialConfig.clockMin);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [speed, setSpeed] = useState<number>(10);

  const [selectedFlightId, setSelectedFlightId] = useState<string | null>(null);
  const [selectedAirportId, setSelectedAirportId] = useState<string | null>(null);
  const [focusAirportSignal, setFocusAirportSignal] = useState<{
    airportId: string;
    nonce: number;
  } | null>(null);

  const [isFiltersOpen, setIsFiltersOpen] = useState<boolean>(false);
  const [isStormDragging, setIsStormDragging] = useState<boolean>(false);
  const [isCrisisModalOpen, setIsCrisisModalOpen] = useState<boolean>(false);
  const [isDispatcherOpen, setIsDispatcherOpen] = useState<boolean>(true);
  const [showFragilityOverlay, setShowFragilityOverlay] =
    useState<boolean>(false);
  const [previewCandidate, setPreviewCandidate] =
    useState<RecoveryCandidate | null>(null);

  const initialEval = useMemo(
    () => evaluateRecoveryCandidates(initialConfig.closures, 5, []),
    [initialConfig.closures]
  );
  const [evaluation, setEvaluation] = useState<RecoveryEvaluation | null>(
    initialEval
  );
  const [briefing, setBriefing] = useState<DispatcherBriefing | null>(() =>
    buildDeterministicBriefing(initialEval)
  );
  const [dispatchMode, setDispatchMode] = useState<
    "ai_verified" | "deterministic_engine"
  >("deterministic_engine");
  const [dispatchLoading, setDispatchLoading] = useState<boolean>(false);
  const dispatchAbortRef = useRef<AbortController | null>(null);
  const isFirstMountRef = useRef<boolean>(true);

  // Respect prefers-reduced-motion on mount without hydration mismatch
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setIsPlaying(false);
    }
  }, []);

  // Sync state when URL searchParams change after initial mount
  useEffect(() => {
    if (isFirstMountRef.current) {
      isFirstMountRef.current = false;
      return;
    }
    setViewMode(initialConfig.viewMode);
    setClosures(initialConfig.closures);
    setActiveActions([]);
    setActivePresetId(initialConfig.presetId);
    setHistory([]);
    setPreviewCandidate(null);
    setSelectedAirportId(null);
    setSelectedFlightId(null);
    setClockMin(initialConfig.clockMin);
  }, [initialConfig]);

  // Keyboard shortcut Cmd/Ctrl + K for Crisis Prompt Modal
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

  // Smooth 60fps requestAnimationFrame live flight progression
  useEffect(() => {
    if (!isPlaying) return;
    let rafId = 0;
    let lastTs = performance.now();
    const minsPerSec = speed === 30 ? 30 : speed === 10 ? 8 : 1.5;

    const tick = (now: number) => {
      const dtSec = Math.min(0.1, (now - lastTs) / 1000);
      lastTs = now;
      setClockMin((prev) => {
        const next = prev + dtSec * minsPerSec;
        return next >= CLOCK_MAX ? CLOCK_MIN : next;
      });
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [isPlaying, speed]);

  const simulation = useMemo(
    () => simulateNetwork(closures, activeActions),
    [closures, activeActions]
  );

  // Airport volume + disruption summary for floating collapsible filter card
  const airportRows = useMemo(() => {
    const counts = new Map<string, { total: number; disrupted: number }>();
    for (const a of DATASET.airports) counts.set(a.id, { total: 0, disrupted: 0 });
    for (const f of simulation.flights) {
      const o = counts.get(f.origin)!;
      o.total++;
      if (f.status !== "ON_TIME") o.disrupted++;
    }
    const maxTotal = Math.max(
      1,
      ...Array.from(counts.values()).map((v) => v.total)
    );
    return DATASET.airports
      .map((a) => ({
        airport: a,
        total: counts.get(a.id)!.total,
        disrupted: counts.get(a.id)!.disrupted,
        pct: Math.round((counts.get(a.id)!.total / maxTotal) * 100),
      }))
      .sort((a, b) => b.disrupted - a.disrupted || b.total - a.total);
  }, [simulation.flights]);

  const disruptedTails = useMemo(() => {
    const map = new Map<
      string,
      { firstFlightId: string; maxDelay: number; breached: boolean }
    >();
    for (const f of simulation.flights) {
      if (f.status === "ON_TIME") continue;
      const cur = map.get(f.tail_id);
      if (!cur) {
        map.set(f.tail_id, {
          firstFlightId: f.flight_id,
          maxDelay: f.delayMin,
          breached: f.status === "CREW_BREACH",
        });
      } else {
        cur.maxDelay = Math.max(cur.maxDelay, f.delayMin);
        if (f.status === "CREW_BREACH") cur.breached = true;
      }
    }
    return Array.from(map.entries());
  }, [simulation.flights]);

  const roundedClockMin = Math.round(clockMin);
  const airportFragilities = useMemo(() => {
    if (viewMode !== "advanced" || !showFragilityOverlay) return [];
    return predictAllAirportFragilities(roundedClockMin, 90);
  }, [viewMode, showFragilityOverlay, roundedClockMin]);

  const fetchDispatch = useCallback(
    async (targetClosures: AirportClosure[], actions: RecoveryAction[]) => {
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
          body: JSON.stringify({
            closures: targetClosures,
            activeActions: actions,
          }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("Dispatch error");
        const data = await res.json();
        setEvaluation(data.evaluation);
        setBriefing(data.briefing);
        setDispatchMode(data.mode);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setDispatchMode("deterministic_engine");
        }
      } finally {
        if (!controller.signal.aborted) setDispatchLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void fetchDispatch(closures, activeActions);
    }, 160);
    return () => {
      window.clearTimeout(handle);
      dispatchAbortRef.current?.abort();
    };
  }, [closures, activeActions, fetchDispatch]);

  function pushHistory() {
    setHistory((prev) => [
      ...prev.slice(-19),
      { closures, activeActions, activePresetId },
    ]);
  }

  function handleSelectPreset(presetId: string) {
    const preset = SCENARIO_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    pushHistory();
    setClosures(preset.closures);
    setActiveActions([]);
    setActivePresetId(preset.id);
    setPreviewCandidate(null);
    setSelectedAirportId(null);
    setSelectedFlightId(null);
    setClockMin(preset.clockMin);
  }

  function handleSaveClosure(closure: AirportClosure) {
    pushHistory();
    setClosures((prev) => [
      ...prev.filter((c) => c.airportId !== closure.airportId),
      closure,
    ]);
    setActiveActions([]);
    setActivePresetId("custom");
    setPreviewCandidate(null);
    setClockMin(Math.min(CLOCK_MAX, closure.startMin + 35));
  }

  function handleRemoveClosure(airportId: string) {
    pushHistory();
    setClosures((prev) => prev.filter((c) => c.airportId !== airportId));
    setActiveActions([]);
    setActivePresetId("custom");
    setPreviewCandidate(null);
  }

  function handleDropStormOnAirport(airportId: string) {
    const airportFlights = DATASET.flights.filter(
      (f) => f.origin === airportId || f.destination === airportId
    );
    const earliest = airportFlights.length
      ? Math.min(...airportFlights.map((f) => parseHHMM(f.dep)))
      : parseHHMM("08:00");
    const startMin = Math.max(parseHHMM("07:00"), earliest + 15);
    const endMin = Math.min(CLOCK_MAX, startMin + 90);
    handleSaveClosure({
      id: `storm-${airportId}-${startMin}`,
      airportId,
      startMin,
      endMin,
      label: `${airportId} Storm`,
    });
    setIsStormDragging(false);
    setSelectedAirportId(airportId);
  }

  function handleApplyCrisisClosures(nextClosures: AirportClosure[]) {
    pushHistory();
    setClosures(nextClosures);
    setActiveActions([]);
    setActivePresetId("custom");
    setPreviewCandidate(null);
    setSelectedAirportId(null);
    if (nextClosures.length > 0) {
      setClockMin(Math.min(CLOCK_MAX, nextClosures[0].startMin + 30));
      setFocusAirportSignal({
        airportId: nextClosures[0].airportId,
        nonce: Date.now(),
      });
    }
    setIsDispatcherOpen(true);
  }

  function handleApplyCandidate(candidate: RecoveryCandidate) {
    if (dispatchLoading) return;
    const existingIds = new Set(activeActions.map((a) => a.id));
    const compatibleNew = candidate.actions.filter(
      (nextAct) =>
        !existingIds.has(nextAct.id) &&
        activeActions.every((ex) => areActionsCompatible(ex, nextAct))
    );
    if (compatibleNew.length === 0) return;

    pushHistory();
    setActiveActions((prev) => [...prev, ...compatibleNew]);
    setPreviewCandidate(null);
  }

  function handleUndo() {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setClosures(prev.closures);
    setActiveActions(prev.activeActions);
    setActivePresetId(prev.activePresetId);
    setPreviewCandidate(null);
  }

  function handleReset() {
    if (closures.length === 0 && activeActions.length === 0) return;
    pushHistory();
    setClosures([]);
    setActiveActions([]);
    setActivePresetId("clear-skies");
    setPreviewCandidate(null);
    setSelectedAirportId(null);
    setSelectedFlightId(null);
  }

  const m = simulation.metrics;
  const pm = previewCandidate?.result.metrics;
  const selectedAirport = selectedAirportId
    ? getAirportById(selectedAirportId)
    : undefined;
  const selectedFlight = selectedFlightId
    ? simulation.flightsById[selectedFlightId]
    : undefined;

  // Floating borderless 2x2 flight telemetry + collapsible airport/tail popover
  const topLeftOverlay = (
    <div className="flex flex-col items-start gap-2.5">
      <div className="rounded-xl bg-[#FBFCFD]/90 pr-3 py-1">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#475569]">
            Flight Statistics
          </span>
          {closures.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#FEE2E2] px-2 py-0.5 font-mono text-[10px] font-semibold text-[#B91C1C]">
              <CloudLightning className="h-2.5 w-2.5" aria-hidden="true" />
              {closures.map((c) => c.airportId).join("+")} CLOSED
            </span>
          )}
        </div>

        <div className="mt-2 grid grid-cols-2 gap-x-5 gap-y-2.5 font-mono tabular-nums">
          <div>
            <div className="text-xl font-bold leading-none text-[#0F172A]">
              {m.delayedFlights}
              {pm && pm.delayedFlights !== m.delayedFlights && (
                <span className="ml-1 text-xs text-[#047857]">
                  →{pm.delayedFlights}
                </span>
              )}
            </div>
            <div className="mt-0.5 font-sans text-[11px] text-[#475569]">
              delayed flights
            </div>
          </div>

          <div>
            <div
              className={`text-xl font-bold leading-none ${
                m.totalStrandedPax > 0 ? "text-[#B91C1C]" : "text-[#0F172A]"
              }`}
            >
              {m.totalStrandedPax}
              {pm && pm.totalStrandedPax !== m.totalStrandedPax && (
                <span className="ml-1 text-xs text-[#047857]">
                  →{pm.totalStrandedPax}
                </span>
              )}
            </div>
            <div className="mt-0.5 font-sans text-[11px] text-[#475569]">
              stranded pax
            </div>
          </div>

          <div>
            <div
              className={`text-xl font-bold leading-none ${
                m.crewBreaches > 0 ? "text-[#B91C1C]" : "text-[#0F172A]"
              }`}
            >
              {m.crewBreaches}
              {pm && pm.crewBreaches !== m.crewBreaches && (
                <span className="ml-1 text-xs text-[#047857]">
                  →{pm.crewBreaches}
                </span>
              )}
            </div>
            <div className="mt-0.5 font-sans text-[11px] text-[#475569]">
              crew breaches
            </div>
          </div>

          <div>
            <div className="text-xl font-bold leading-none text-[#0F172A]">
              {m.totalDelayMinutes}m
              {pm && pm.totalDelayMinutes !== m.totalDelayMinutes && (
                <span className="ml-1 text-xs text-[#047857]">
                  →{pm.totalDelayMinutes}m
                </span>
              )}
            </div>
            <div className="mt-0.5 font-sans text-[11px] text-[#475569]">
              total delay
            </div>
          </div>
        </div>
      </div>

      {/* Collapsible Trigger Row */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          aria-expanded={isFiltersOpen}
          onClick={() => setIsFiltersOpen((v) => !v)}
          className="flex h-7 cursor-pointer items-center gap-1.5 rounded-full border border-[#E6EBF2] bg-[#FFFFFF] px-3 text-xs font-medium text-[#0F172A] shadow-[0_2px_10px_rgba(148,163,184,0.12)] transition-colors duration-150 hover:bg-[#F8FAFC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB]"
        >
          <span>Airports &amp; Disrupted Tails</span>
          {isFiltersOpen ? (
            <ChevronUp className="h-3.5 w-3.5 text-[#475569]" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-[#475569]" aria-hidden="true" />
          )}
        </button>

        {viewMode === "advanced" && (
          <button
            type="button"
            aria-pressed={showFragilityOverlay}
            onClick={() => setShowFragilityOverlay((v) => !v)}
            className={`flex h-7 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-xs font-medium shadow-[0_2px_10px_rgba(148,163,184,0.12)] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB] ${
              showFragilityOverlay
                ? "border-[#1D4ED8] bg-[#EFF6FF] text-[#1D4ED8]"
                : "border-[#E6EBF2] bg-[#FFFFFF] text-[#475569] hover:text-[#0F172A]"
            }`}
          >
            <Layers className="h-3.5 w-3.5" aria-hidden="true" />
            Hub Fragility Rings
          </button>
        )}
      </div>

      {/* Lightweight Floating Card: Disrupted Tails & 16-Airport List */}
      {isFiltersOpen && (
        <div className="max-h-[52vh] w-72 overflow-y-auto rounded-xl border border-[#E6EBF2] bg-[#FFFFFF] p-3 shadow-[0_10px_28px_rgba(148,163,184,0.18)]">
          {disruptedTails.length > 0 && (
            <div className="mb-3 border-b border-[#E6EBF2] pb-2.5">
              <div className="text-[11px] font-semibold text-[#0F172A]">
                Disrupted aircraft ({disruptedTails.length})
              </div>
              <div className="mt-1.5 space-y-1">
                {disruptedTails.slice(0, 6).map(([tailId, info]) => {
                  const active =
                    selectedFlightId &&
                    simulation.flightsById[selectedFlightId]?.tail_id === tailId;
                  return (
                    <button
                      key={tailId}
                      type="button"
                      onClick={() => {
                        setSelectedFlightId(info.firstFlightId);
                        setIsFiltersOpen(false);
                      }}
                      className={`flex w-full cursor-pointer items-center justify-between rounded-md px-2 py-1 text-xs transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB] ${
                        active
                          ? "bg-[#EFF6FF] font-semibold text-[#1D4ED8]"
                          : "hover:bg-[#F8FAFC]"
                      }`}
                    >
                      <span className="inline-flex items-center gap-1.5 font-mono">
                        <Plane className="h-3 w-3 text-[#475569]" aria-hidden="true" />
                        {tailId}
                      </span>
                      <span
                        className={`font-mono text-[11px] font-semibold ${
                          info.breached ? "text-[#B91C1C]" : "text-[#B45309]"
                        }`}
                      >
                        {info.breached ? "BREACH" : `+${info.maxDelay}m`}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-[#0F172A]">
                Airports (16)
              </span>
              <span className="text-[10px] text-[#475569]">Click to close</span>
            </div>
            <div className="mt-1.5 space-y-1">
              {airportRows.map(({ airport, total, disrupted, pct }) => {
                const isClosed = closures.some((c) => c.airportId === airport.id);
                return (
                  <button
                    key={airport.id}
                    type="button"
                    onClick={() => {
                      setSelectedAirportId(airport.id);
                      setFocusAirportSignal({
                        airportId: airport.id,
                        nonce: Date.now(),
                      });
                      setIsFiltersOpen(false);
                    }}
                    className={`relative flex w-full cursor-pointer items-center justify-between overflow-hidden rounded-md px-2 py-1.5 text-left text-xs transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB] ${
                      isClosed
                        ? "border border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]"
                        : selectedAirportId === airport.id
                          ? "bg-[#EFF6FF] text-[#1D4ED8]"
                          : "hover:bg-[#F8FAFC]"
                    }`}
                  >
                    <span
                      className={`pointer-events-none absolute inset-y-0 left-0 ${
                        isClosed ? "bg-[#FEE2E2]/60" : "bg-[#EFF6FF]"
                      }`}
                      style={{ width: `${pct}%`, opacity: isClosed ? 1 : 0.7 }}
                    />
                    <span className="relative z-10 flex items-center gap-1.5">
                      <span className="font-mono font-bold">{airport.id}</span>
                      <span className="truncate text-[#475569]">
                        {airport.city}
                      </span>
                    </span>
                    <span className="relative z-10 font-mono text-[11px] tabular-nums text-[#475569]">
                      {disrupted > 0 ? (
                        <span className="font-semibold text-[#B45309]">
                          {disrupted}/{total}
                        </span>
                      ) : (
                        total
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#FBFCFD] text-[#0F172A]">
      <TopTelemetryBar
        activePresetId={activePresetId}
        closures={closures}
        viewMode={viewMode}
        canUndo={history.length > 0}
        isDispatcherOpen={isDispatcherOpen}
        candidateCount={evaluation?.candidates.length ?? 0}
        isMapExpanded={!isDispatcherOpen}
        onChangeViewMode={setViewMode}
        onSelectPreset={handleSelectPreset}
        onOpenCrisisModal={() => setIsCrisisModalOpen(true)}
        onUndo={handleUndo}
        onReset={handleReset}
        onToggleDispatcher={() => setIsDispatcherOpen((v) => !v)}
        onToggleFullscreenMap={() => setIsDispatcherOpen((v) => !v)}
        onStormDragState={setIsStormDragging}
      />

      {/* Full-Bleed Map Center + Floating Scrubber + Optional Right Dispatcher */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[#FBFCFD]">
          <main className="relative min-h-0 flex-1 overflow-hidden">
            <RadarMap
              simulation={simulation}
              previewCandidate={previewCandidate}
              clockMin={clockMin}
              selectedFlightId={selectedFlightId}
              selectedAirportId={selectedAirportId}
              isStormDragging={isStormDragging}
              showFragilityOverlay={viewMode === "advanced" && showFragilityOverlay}
              airportFragilities={airportFragilities}
              focusAirportSignal={focusAirportSignal}
              topLeftOverlay={topLeftOverlay}
              onSelectFlight={(fid) => setSelectedFlightId(fid)}
              onSelectAirport={(aid) => setSelectedAirportId(aid)}
              onDropStormOnAirport={handleDropStormOnAirport}
              onRemoveClosure={handleRemoveClosure}
            />

            {selectedFlight && (
              <FlightInspector
                flight={selectedFlight}
                connections={simulation.connections}
                onSelectFlight={(fid) => setSelectedFlightId(fid)}
                onClose={() => setSelectedFlightId(null)}
              />
            )}

            {selectedAirport && (
              <AirportClosurePopover
                key={selectedAirport.id}
                airport={selectedAirport}
                existingClosure={closures.find(
                  (c) => c.airportId === selectedAirport.id
                )}
                simulation={simulation}
                onSaveClosure={handleSaveClosure}
                onRemoveClosure={handleRemoveClosure}
                onClose={() => setSelectedAirportId(null)}
              />
            )}
          </main>

          <TimelineScrubber
            simulation={simulation}
            clockMin={clockMin}
            isPlaying={isPlaying}
            speed={speed}
            onChangeClock={(min) => {
              setIsPlaying(false);
              setClockMin(min);
            }}
            onTogglePlay={() => setIsPlaying((p) => !p)}
            onCycleSpeed={() =>
              setSpeed((s) => (s === 1 ? 10 : s === 10 ? 30 : 1))
            }
          />

          {viewMode === "advanced" && (
            <TailChainGantt
              simulation={simulation}
              clockMin={clockMin}
              selectedFlightId={selectedFlightId}
              onSelectFlight={(fid) => setSelectedFlightId(fid)}
              onChangeClock={(min) => {
                setIsPlaying(false);
                setClockMin(min);
              }}
            />
          )}
        </div>

        <AiDispatcherDrawer
          isOpen={isDispatcherOpen}
          viewMode={viewMode}
          loading={dispatchLoading}
          mode={dispatchMode}
          evaluation={evaluation}
          briefing={briefing}
          activeActions={activeActions}
          previewCandidateId={previewCandidate?.id ?? null}
          onPreviewCandidate={setPreviewCandidate}
          onApplyCandidate={handleApplyCandidate}
          onUndoRecovery={handleUndo}
          onRefresh={() => void fetchDispatch(closures, activeActions)}
          onClose={() => setIsDispatcherOpen(false)}
          onApplySuggestedClosures={handleApplyCrisisClosures}
          onFocusFlight={(fid) => setSelectedFlightId(fid)}
          onFocusAirport={(aid) =>
            setFocusAirportSignal({ airportId: aid, nonce: Date.now() })
          }
        />
      </div>

      <CrisisCommandModal
        isOpen={isCrisisModalOpen}
        onApplyClosures={handleApplyCrisisClosures}
        onClose={() => setIsCrisisModalOpen(false)}
      />
    </div>
  );
}

export default function SimulatorPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-[#FBFCFD] font-mono text-sm text-[#475569]">
          Loading Domino Sky Radar...
        </div>
      }
    >
      <SimulatorContent />
    </Suspense>
  );
}
