"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AiDispatcherDrawer } from "@/components/AiDispatcherDrawer";
import { AirportClosurePopover } from "@/components/AirportClosurePopover";
import { CrisisCommandBar } from "@/components/CrisisCommandBar";
import { FlightInspector } from "@/components/FlightInspector";
import { RadarMap } from "@/components/RadarMap";
import { TailChainGantt } from "@/components/TailChainGantt";
import { CLOCK_MAX, CLOCK_MIN, TimelineScrubber } from "@/components/TimelineScrubber";
import { SCENARIO_PRESETS, TopTelemetryBar } from "@/components/TopTelemetryBar";
import { DATASET, getAirportById, parseHHMM, simulateNetwork } from "@/lib/sim/engine";
import { buildDeterministicBriefing, evaluateRecoveryCandidates } from "@/lib/sim/recovery";
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

const DEFAULT_PRESET = SCENARIO_PRESETS[0]; // BOM 90m Thunderstorm (07:30-09:00)

export default function DominoSkyPage() {
  const [closures, setClosures] = useState<AirportClosure[]>(DEFAULT_PRESET.closures);
  const [activeActions, setActiveActions] = useState<RecoveryAction[]>([]);
  const [activePresetId, setActivePresetId] = useState<string>(DEFAULT_PRESET.id);
  const [history, setHistory] = useState<HistorySnapshot[]>([]);

  const [clockMin, setClockMin] = useState<number>(DEFAULT_PRESET.clockMin);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [speed, setSpeed] = useState<number>(10);

  const [selectedFlightId, setSelectedFlightId] = useState<string | null>(null);
  const [selectedAirportId, setSelectedAirportId] = useState<string | null>(null);
  const [isStormDragging, setIsStormDragging] = useState<boolean>(false);
  const [isCrisisBarOpen, setIsCrisisBarOpen] = useState<boolean>(false);
  const [isDispatcherOpen, setIsDispatcherOpen] = useState<boolean>(true);
  const [previewCandidate, setPreviewCandidate] =
    useState<RecoveryCandidate | null>(null);

  // AI Dispatcher state (pre-seeded deterministically on first render, synced with /api/dispatch)
  const initialEval = useMemo(
    () => evaluateRecoveryCandidates(DEFAULT_PRESET.closures, 5),
    []
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

  // Respect prefers-reduced-motion before enabling auto-playback
  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduced) {
      setIsPlaying(true);
    }
  }, []);

  // Live deterministic simulation
  const simulation = useMemo(
    () => simulateNetwork(closures, activeActions),
    [closures, activeActions]
  );

  // Simulation playback ticker
  useEffect(() => {
    if (!isPlaying) return;
    const intervalMs = speed === 30 ? 120 : speed === 10 ? 280 : 900;
    const timer = window.setInterval(() => {
      setClockMin((prev) => (prev >= CLOCK_MAX ? CLOCK_MIN : prev + 1));
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [isPlaying, speed]);

  // Fetch grounded AI Dispatcher briefing whenever closures change
  const fetchDispatch = useCallback(async (targetClosures: AirportClosure[]) => {
    dispatchAbortRef.current?.abort();
    const controller = new AbortController();
    dispatchAbortRef.current = controller;

    // Update deterministic evaluation immediately so UI is instant even before LLM returns
    const localEval = evaluateRecoveryCandidates(targetClosures, 5);
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
        body: JSON.stringify({ closures: targetClosures }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error("Dispatch failed");
      const data = await res.json();
      setEvaluation(data.evaluation);
      setBriefing(data.briefing);
      setDispatchMode(data.mode);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setDispatchMode("deterministic_engine");
      }
    } finally {
      if (!controller.signal.aborted) {
        setDispatchLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void fetchDispatch(closures);
    }, 180);
    return () => window.clearTimeout(handle);
  }, [closures, fetchDispatch]);

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
    setClosures((prev) => {
      const filtered = prev.filter((c) => c.airportId !== closure.airportId);
      return [...filtered, closure];
    });
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
    const earliestTouch = airportFlights.length
      ? Math.min(...airportFlights.map((f) => parseHHMM(f.dep)))
      : parseHHMM("08:00");
    const startMin = Math.max(parseHHMM("07:00"), earliestTouch + 15);
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
    }
    setIsDispatcherOpen(true);
  }

  function handleApplyCandidate(candidate: RecoveryCandidate) {
    pushHistory();
    setActiveActions(candidate.actions);
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

  const selectedAirport = selectedAirportId
    ? getAirportById(selectedAirportId)
    : undefined;
  const selectedFlight = selectedFlightId
    ? simulation.flightsById[selectedFlightId]
    : undefined;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#090D12] text-[#F1F5F9]">
      <TopTelemetryBar
        activePresetId={activePresetId}
        closures={closures}
        simulation={simulation}
        previewCandidate={previewCandidate}
        activeActions={activeActions}
        canUndo={history.length > 0}
        isCrisisBarOpen={isCrisisBarOpen}
        isDispatcherOpen={isDispatcherOpen}
        onSelectPreset={handleSelectPreset}
        onToggleCrisisBar={() => setIsCrisisBarOpen((v) => !v)}
        onUndo={handleUndo}
        onReset={handleReset}
        onToggleDispatcher={() => setIsDispatcherOpen((v) => !v)}
        onStormDragState={setIsStormDragging}
      />

      {isCrisisBarOpen && (
        <CrisisCommandBar
          onApplyClosures={handleApplyCrisisClosures}
          onClose={() => setIsCrisisBarOpen(false)}
        />
      )}

      {/* Main Flex Workspace: Radar + Gantt on left, Flex-Docked AI Dispatcher on right */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* Primary FlightRadar24 OCC Map Viewport */}
          <main className="relative min-h-0 flex-1 overflow-hidden">
            <RadarMap
              simulation={simulation}
              previewCandidate={previewCandidate}
              clockMin={clockMin}
              selectedFlightId={selectedFlightId}
              selectedAirportId={selectedAirportId}
              isStormDragging={isStormDragging}
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

            <TimelineScrubber
              clockMin={clockMin}
              isPlaying={isPlaying}
              speed={speed}
              closures={closures}
              onChangeClock={(min) => {
                setIsPlaying(false);
                setClockMin(min);
              }}
              onTogglePlay={() => setIsPlaying((p) => !p)}
              onCycleSpeed={() =>
                setSpeed((s) => (s === 1 ? 10 : s === 10 ? 30 : 1))
              }
            />
          </main>

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
        </div>

        <AiDispatcherDrawer
          isOpen={isDispatcherOpen}
          loading={dispatchLoading}
          mode={dispatchMode}
          evaluation={evaluation}
          briefing={briefing}
          activeActions={activeActions}
          previewCandidateId={previewCandidate?.id ?? null}
          onPreviewCandidate={setPreviewCandidate}
          onApplyCandidate={handleApplyCandidate}
          onUndoRecovery={handleUndo}
          onRefresh={() => void fetchDispatch(closures)}
          onClose={() => setIsDispatcherOpen(false)}
        />
      </div>
    </div>
  );
}
