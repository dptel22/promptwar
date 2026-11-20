/**
 * Interactive OCC Simulator route assembling the telemetry header, live India
 * radar canvas, timeline scrubber, tail-chain Gantt, and AI Helper drawer.
 */

"use client";

import { Suspense } from "react";
import { AiDispatcherDrawer } from "@/components/AiDispatcherDrawer";
import { AirportClosurePopover } from "@/components/AirportClosurePopover";
import { CrisisCommandModal } from "@/components/CrisisCommandModal";
import { FlightInspector } from "@/components/FlightInspector";
import { RadarMap } from "@/components/RadarMap";
import { TailChainGantt } from "@/components/TailChainGantt";
import { TimelineScrubber } from "@/components/TimelineScrubber";
import { TopTelemetryBar } from "@/components/TopTelemetryBar";
import { FlightStatsOverlay } from "@/components/simulator/FlightStatsOverlay";
import { useSimulatorState } from "@/components/simulator/useSimulatorState";

function SimulatorContent() {
  const sim = useSimulatorState();

  const topLeftOverlay = (
    <FlightStatsOverlay
      simulation={sim.simulation}
      previewCandidate={sim.previewCandidate}
      viewMode={sim.viewMode}
      showFragilityOverlay={sim.showFragilityOverlay}
      selectedFlightId={sim.selectedFlightId}
      selectedAirportId={sim.selectedAirportId}
      onToggleFragilityOverlay={() => sim.setShowFragilityOverlay((v) => !v)}
      onSelectFlight={sim.setSelectedFlightId}
      onSelectAirport={(aid) => {
        sim.setSelectedAirportId(aid);
        sim.focusAirport(aid);
      }}
    />
  );

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#FBFCFD] text-[#0F172A]">
      <TopTelemetryBar
        activePresetId={sim.activePresetId}
        closures={sim.closures}
        viewMode={sim.viewMode}
        canUndo={sim.canUndo}
        isDispatcherOpen={sim.isDispatcherOpen}
        candidateCount={sim.evaluation?.candidates.length ?? 0}
        isMapExpanded={!sim.isDispatcherOpen}
        onChangeViewMode={sim.setViewMode}
        onSelectPreset={sim.handleSelectPreset}
        onOpenCrisisModal={() => sim.setIsCrisisModalOpen(true)}
        onUndo={sim.handleUndo}
        onReset={sim.handleReset}
        onToggleDispatcher={() => sim.setIsDispatcherOpen((v) => !v)}
        onToggleFullscreenMap={() => sim.setIsDispatcherOpen((v) => !v)}
        onStormDragState={sim.setIsStormDragging}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[#FBFCFD]">
          <main id="main-content" className="relative min-h-0 flex-1 overflow-hidden">
            <RadarMap
              simulation={sim.simulation}
              previewCandidate={sim.previewCandidate}
              clockMin={sim.clockMin}
              selectedFlightId={sim.selectedFlightId}
              selectedAirportId={sim.selectedAirportId}
              isStormDragging={sim.isStormDragging}
              showFragilityOverlay={
                sim.viewMode === "advanced" && sim.showFragilityOverlay
              }
              airportFragilities={sim.airportFragilities}
              focusAirportSignal={sim.focusAirportSignal}
              topLeftOverlay={topLeftOverlay}
              onSelectFlight={sim.setSelectedFlightId}
              onSelectAirport={sim.setSelectedAirportId}
              onDropStormOnAirport={sim.handleDropStormOnAirport}
              onRemoveClosure={sim.handleRemoveClosure}
            />

            {sim.selectedFlight && (
              <FlightInspector
                flight={sim.selectedFlight}
                connections={sim.simulation.connections}
                onSelectFlight={sim.setSelectedFlightId}
                onClose={sim.clearSelectedFlight}
              />
            )}

            {sim.selectedAirport && (
              <AirportClosurePopover
                key={sim.selectedAirport.id}
                airport={sim.selectedAirport}
                existingClosure={sim.closures.find(
                  (c) => c.airportId === sim.selectedAirport?.id
                )}
                simulation={sim.simulation}
                onSaveClosure={sim.handleSaveClosure}
                onRemoveClosure={sim.handleRemoveClosure}
                onClose={sim.clearSelectedAirport}
              />
            )}
          </main>

          <TimelineScrubber
            simulation={sim.simulation}
            clockMin={sim.clockMin}
            isPlaying={sim.isPlaying}
            speed={sim.speed}
            onChangeClock={sim.handleChangeClock}
            onTogglePlay={sim.handleTogglePlay}
            onCycleSpeed={sim.handleCycleSpeed}
          />

          {sim.viewMode === "advanced" && (
            <TailChainGantt
              simulation={sim.simulation}
              clockMin={sim.clockMin}
              selectedFlightId={sim.selectedFlightId}
              onSelectFlight={sim.setSelectedFlightId}
              onChangeClock={sim.handleChangeClock}
            />
          )}
        </div>

        <AiDispatcherDrawer
          isOpen={sim.isDispatcherOpen}
          viewMode={sim.viewMode}
          loading={sim.dispatchLoading}
          mode={sim.dispatchMode}
          evaluation={sim.evaluation}
          briefing={sim.briefing}
          activeActions={sim.activeActions}
          previewCandidateId={sim.previewCandidate?.id ?? null}
          onPreviewCandidate={sim.setPreviewCandidate}
          onApplyCandidate={sim.handleApplyCandidate}
          onUndoRecovery={sim.handleUndo}
          onRefresh={sim.refreshDispatch}
          onClose={() => sim.setIsDispatcherOpen(false)}
          onApplySuggestedClosures={sim.handleApplyCrisisClosures}
          onFocusFlight={sim.setSelectedFlightId}
          onFocusAirport={sim.focusAirport}
        />
      </div>

      <CrisisCommandModal
        isOpen={sim.isCrisisModalOpen}
        onApplyClosures={sim.handleApplyCrisisClosures}
        onClose={sim.closeCrisisModal}
      />
    </div>
  );
}

/**
 * Suspense-wrapped OCC simulator entry page supporting URL query scenarios.
 */
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
