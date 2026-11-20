"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CloudLightning, Layers, Plane } from "lucide-react";
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

const DEFAULT_PRESET = SCENARIO_PRESETS[0];

function SimulatorContent() {
  const searchParams = useSearchParams();

  const initialConfig = useMemo(() => {
    const viewParam = searchParams.get("view") === "advanced" ? "advanced" : "simple";
    const airportParam = searchParams.get("airport");
    const startParam = Number(searchParams.get("start"));
    const durParam = Number(searchParams.get("dur"));

    if (airportParam && getAirportById(airportParam)) {
      const startMin = Number.isFinite(startParam) && startParam >= 300 ? startParam : 480;
      const dur = Number.isFinite(durParam) && durParam >= 15 ? durParam : 90;
      return {
        viewMode: viewParam as "simple" | "advanced",
        presetId: "custom",
        clockMin: Math.min(CLOCK_MAX, startMin + 30),
        closures: [
          {
            id: `url-${airportParam}`,
            airportId: airportParam,
            startMin,
            endMin: Math.min(CLOCK_MAX, startMin + dur),
            label: `${airportParam} Closure`,
          },
        ] as AirportClosure[],
      };
    }

    const presetParam = searchParams.get("preset");
    const matched = SCENARIO_PRESETS.find((p) => p.id === presetParam) ?? DEFAULT_PRESET;
    return {
      viewMode: viewParam as "simple" | "advanced",
      presetId: matched.id,
      clockMin: matched.clockMin,
      closures: matched.closures,
    };
  }, [searchParams]);

  const [viewMode, setViewMode] = useState<"simple" | "advanced">(
    initialConfig.viewMode
  );
  const [closures, setClosures] = useState<AirportClosure[]>(initialConfig.closures);
  const [activeActions, setActiveActions] = useState<RecoveryAction[]>([]);
  const [activePresetId, setActivePresetId] = useState<string>(initialConfig.presetId);
  const [history, setHistory] = useState<HistorySnapshot[]>([]);

  const [clockMin, setClockMin] = useState<number>(initialConfig.clockMin);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [speed, setSpeed] = useState<number>(10);

  const [selectedFlightId, setSelectedFlightId] = useState<string | null>(null);
  const [selectedAirportId, setSelectedAirportId] = useState<string | null>(null);
  const [focusAirportSignal, setFocusAirportSignal] = useState<{
    airportId: string;
    nonce: number;
  } | null>(null);

  const [isStormDragging, setIsStormDragging] = useState<boolean>(false);
  const [isCrisisModalOpen, setIsCrisisModalOpen] = useState<boolean>(false);
  const [isDispatcherOpen, setIsDispatcherOpen] = useState<boolean>(true);
  const [showFragilityOverlay, setShowFragilityOverlay] = useState<boolean>(false);
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

  useEffect(() => {
    if (!isPlaying) return;
    const intervalMs = speed === 30 ? 120 : speed === 10 ? 280 : 900;
    const timer = window.setInterval(() => {
      setClockMin((prev) => (prev >= CLOCK_MAX ? CLOCK_MIN : prev + 1));
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [isPlaying, speed]);

  const simulation = useMemo(
    () => simulateNetwork(closures, activeActions),
    [closures, activeActions]
  );

  // Airport volume + disruption summary for left Image 3 style filter rail
  const airportRows = useMemo(() => {
    const counts = new Map<string, { total: number; disrupted: number }>();
    for (const a of DATASET.airports) counts.set(a.id, { total: 0, disrupted: 0 });
    for (const f of simulation.flights) {
      const o = counts.get(f.origin)!;
      o.total++;
      if (f.status !== "ON_TIME") o.disrupted++;
    }
    const maxTotal = Math.max(1, ...Array.from(counts.values()).map((v) => v.total));
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
    const map = new Map<string, { firstFlightId: string; maxDelay: number; breached: boolean }>();
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

  const airportFragilities = useMemo(
    () => predictAllAirportFragilities(clockMin, 90),
    [clockMin]
  );

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
    return () => window.clearTimeout(handle);
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
    pushHistory();
    setActiveActions((prev) => [...prev, ...candidate.actions]);
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

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#F8FAFC] text-[#0F172A]">
      <TopTelemetryBar
        activePresetId={activePresetId}
        closures={closures}
        viewMode={viewMode}
        canUndo={history.length > 0}
        isDispatcherOpen={isDispatcherOpen}
        onChangeViewMode={setViewMode}
        onSelectPreset={handleSelectPreset}
        onOpenCrisisModal={() => setIsCrisisModalOpen(true)}
        onUndo={handleUndo}
        onReset={handleReset}
        onToggleDispatcher={() => setIsDispatcherOpen((v) => !v)}
        onStormDragState={setIsStormDragging}
      />

      {/* Image 3 Inspired Top-Down 3-Zone Workspace */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left Clean Statistics & Airport/Tail Filter Rail */}
        <aside
          aria-label="Network flight statistics and airport filters"
          className="hidden w-64 shrink-0 flex-col divide-y divide-[#E2E8F0] overflow-y-auto border-r border-[#E2E8F0] bg-[#FFFFFF] md:flex"
        >
          {/* 2x2 Big Tabular Flight Statistics (FlightMapper.io layout) */}
          <div className="p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-[#0F172A]">
                Flight Statistics
              </h2>
              {closures.length > 0 && (
                <span className="inline-flex items-center gap-1 rounded-sm bg-[#FEF2F2] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#DC2626]">
                  <CloudLightning className="h-2.5 w-2.5" aria-hidden="true" />
                  {closures.map((c) => c.airportId).join("+")} CLOSED
                </span>
              )}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-y-3 font-mono tabular-nums">
              <div>
                <div className="text-2xl font-bold leading-none text-[#0F172A]">
                  {m.delayedFlights}
                  {pm && pm.delayedFlights !== m.delayedFlights && (
                    <span className="ml-1 text-xs text-[#059669]">
                      →{pm.delayedFlights}
                    </span>
                  )}
                </div>
                <div className="mt-1 font-sans text-xs text-[#475569]">
                  delayed flights
                </div>
              </div>

              <div>
                <div
                  className={`text-2xl font-bold leading-none ${
                    m.totalStrandedPax > 0 ? "text-[#DC2626]" : "text-[#0F172A]"
                  }`}
                >
                  {m.totalStrandedPax}
                  {pm && pm.totalStrandedPax !== m.totalStrandedPax && (
                    <span className="ml-1 text-xs text-[#059669]">
                      →{pm.totalStrandedPax}
                    </span>
                  )}
                </div>
                <div className="mt-1 font-sans text-xs text-[#475569]">
                  stranded pax
                </div>
              </div>

              <div>
                <div
                  className={`text-2xl font-bold leading-none ${
                    m.crewBreaches > 0 ? "text-[#DC2626]" : "text-[#0F172A]"
                  }`}
                >
                  {m.crewBreaches}
                  {pm && pm.crewBreaches !== m.crewBreaches && (
                    <span className="ml-1 text-xs text-[#059669]">
                      →{pm.crewBreaches}
                    </span>
                  )}
                </div>
                <div className="mt-1 font-sans text-xs text-[#475569]">
                  crew breaches
                </div>
              </div>

              <div>
                <div className="text-2xl font-bold leading-none text-[#0F172A]">
                  {m.totalDelayMinutes}m
                </div>
                <div className="mt-1 font-sans text-xs text-[#475569]">
                  total delay
                </div>
              </div>
            </div>
          </div>

          {/* Disrupted Aircraft Chains (Quick Flight-Specific Focus) */}
          {disruptedTails.length > 0 && (
            <div className="p-4">
              <div className="text-xs font-semibold text-[#0F172A]">
                Disrupted aircraft ({disruptedTails.length})
              </div>
              <div className="mt-2 space-y-1">
                {disruptedTails.slice(0, 6).map(([tailId, info]) => {
                  const active =
                    selectedFlightId &&
                    simulation.flightsById[selectedFlightId]?.tail_id === tailId;
                  return (
                    <button
                      key={tailId}
                      type="button"
                      onClick={() => setSelectedFlightId(info.firstFlightId)}
                      className={`flex w-full cursor-pointer items-center justify-between rounded-md px-2 py-1 text-xs transition-colors duration-150 ${
                        active
                          ? "bg-[#EFF6FF] font-semibold text-[#2563EB]"
                          : "hover:bg-[#F1F5F9]"
                      }`}
                    >
                      <span className="inline-flex items-center gap-1.5 font-mono">
                        <Plane className="h-3 w-3 text-[#475569]" aria-hidden="true" />
                        {tailId}
                      </span>
                      <span
                        className={`font-mono text-[11px] font-semibold ${
                          info.breached ? "text-[#DC2626]" : "text-[#B45309]"
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

          {/* Airports with Volume Bars (Image 3 Filter List Style) */}
          <div className="flex-1 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-[#0F172A]">
                Airports (16)
              </h2>
              <span className="text-[11px] text-[#475569]">Click to close</span>
            </div>
            <div className="mt-2 space-y-1">
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
                    }}
                    className={`relative flex w-full cursor-pointer items-center justify-between overflow-hidden rounded-md px-2 py-1.5 text-left text-xs transition-colors duration-150 ${
                      isClosed
                        ? "border border-[#FECACA] bg-[#FEF2F2] text-[#DC2626]"
                        : selectedAirportId === airport.id
                          ? "bg-[#EFF6FF] text-[#2563EB]"
                          : "hover:bg-[#F1F5F9]"
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
        </aside>

        {/* Center Sculpted Map + Dedicated Bottom Histogram Scrubber + Optional Advanced Gantt */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
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
              onSelectFlight={(fid) => setSelectedFlightId(fid)}
              onSelectAirport={(aid) => setSelectedAirportId(aid)}
              onDropStormOnAirport={handleDropStormOnAirport}
              onRemoveClosure={handleRemoveClosure}
            />

            {viewMode === "advanced" && (
              <button
                type="button"
                onClick={() => setShowFragilityOverlay((v) => !v)}
                className={`absolute left-3 top-20 z-10 flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium shadow-sm transition-colors duration-150 ${
                  showFragilityOverlay
                    ? "border-[#2563EB] bg-[#EFF6FF] text-[#2563EB]"
                    : "border-[#E2E8F0] bg-[#FFFFFF] text-[#475569] hover:text-[#0F172A]"
                }`}
              >
                <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                Hub Fragility Rings
              </button>
            )}

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
        <div className="flex h-screen items-center justify-center bg-[#F8FAFC] font-mono text-sm text-[#475569]">
          Loading Domino Sky Radar...
        </div>
      }
    >
      <SimulatorContent />
    </Suspense>
  );
}
