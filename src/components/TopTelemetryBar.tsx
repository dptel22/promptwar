/**
 * Segmented top telemetry header providing scenario preset switching, Simple/Advanced
 * mode toggle, draggable storm cell, Crisis modal trigger, undo/reset, and AI Helper toggle.
 */

"use client";

import Link from "next/link";
import {
  CloudLightning,
  Cpu,
  Maximize2,
  Minimize2,
  Radar,
  RotateCcw,
  Terminal,
  Undo2,
} from "lucide-react";
import { SCENARIO_PRESETS, type ScenarioPreset } from "@/lib/sim/presets";
import type { AirportClosure } from "@/lib/sim/types";

export { SCENARIO_PRESETS, type ScenarioPreset };

/** Props accepted by `TopTelemetryBar`. */
export interface TopTelemetryBarProps {
  activePresetId: string;
  closures: AirportClosure[];
  viewMode: "simple" | "advanced";
  canUndo: boolean;
  isDispatcherOpen: boolean;
  candidateCount?: number;
  isMapExpanded?: boolean;
  onChangeViewMode: (mode: "simple" | "advanced") => void;
  onSelectPreset: (presetId: string) => void;
  onOpenCrisisModal: () => void;
  onUndo: () => void;
  onReset: () => void;
  onToggleDispatcher: () => void;
  onToggleFullscreenMap?: () => void;
  onStormDragState: (dragging: boolean) => void;
}

/**
 * Renders the single-row segmented OCC control bar above the radar canvas.
 */
export function TopTelemetryBar({
  activePresetId,
  closures,
  viewMode,
  canUndo,
  isDispatcherOpen,
  candidateCount = 0,
  isMapExpanded = false,
  onChangeViewMode,
  onSelectPreset,
  onOpenCrisisModal,
  onUndo,
  onReset,
  onToggleDispatcher,
  onToggleFullscreenMap,
  onStormDragState,
}: TopTelemetryBarProps) {
  return (
    <header className="flex h-14 w-full shrink-0 items-center justify-between border-b border-[#E6EBF2] bg-[#FFFFFF]">
      <div className="flex h-full items-center gap-3 px-3 lg:px-4">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB]"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-md border border-[#E6EBF2] bg-[#FBFCFD]">
            <Radar className="h-4 w-4 text-[#1D4ED8]" aria-hidden="true" />
          </span>
          <span className="font-display text-sm font-bold tracking-tight text-[#0F172A]">
            Domino Sky
          </span>
        </Link>

        <nav
          aria-label="Primary navigation"
          className="hidden items-center gap-1 border-l border-[#E6EBF2] pl-3 md:flex"
        >
          <Link
            href="/"
            className="rounded-md px-2.5 py-1 text-xs font-medium text-[#475569] transition-colors duration-150 hover:bg-[#F8FAFC] hover:text-[#0F172A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB]"
          >
            Story
          </Link>
          <Link
            href="/simulator"
            aria-current="page"
            className="rounded-md bg-[#EFF6FF] px-2.5 py-1 text-xs font-semibold text-[#1D4ED8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB]"
          >
            Simulator
          </Link>
          <Link
            href="/about"
            className="rounded-md px-2.5 py-1 text-xs font-medium text-[#475569] transition-colors duration-150 hover:bg-[#F8FAFC] hover:text-[#0F172A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB]"
          >
            About
          </Link>
        </nav>
      </div>

      <div className="flex h-full items-center divide-x divide-[#E6EBF2] border-l border-[#E6EBF2]">
        <div className="flex h-full items-center gap-2 px-3">
          <label htmlFor="scenario-select" className="sr-only">
            Select disruption scenario preset
          </label>
          <select
            id="scenario-select"
            value={activePresetId}
            onChange={(e) => onSelectPreset(e.target.value)}
            className="h-8 max-w-[205px] cursor-pointer truncate rounded-md border border-transparent bg-transparent px-1.5 text-xs font-medium text-[#475569] transition-colors duration-150 hover:border-[#E6EBF2] hover:text-[#0F172A] focus-visible:border-[#2B79FB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB]"
          >
            {activePresetId === "custom" && (
              <option value="custom">
                Custom ({closures.map((c) => c.airportId).join("+") || "Clear"})
              </option>
            )}
            {SCENARIO_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>

          <div
            role="group"
            aria-label="View complexity"
            className="flex rounded-md border border-[#E6EBF2] bg-[#FBFCFD] p-0.5 text-xs font-medium"
          >
            <button
              type="button"
              aria-pressed={viewMode === "simple"}
              onClick={() => onChangeViewMode("simple")}
              className={`cursor-pointer rounded px-2.5 py-1 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB] ${
                viewMode === "simple"
                  ? "bg-[#FFFFFF] font-semibold text-[#0F172A] shadow-xs"
                  : "text-[#475569] hover:text-[#0F172A]"
              }`}
            >
              Simple
            </button>
            <button
              type="button"
              aria-pressed={viewMode === "advanced"}
              onClick={() => onChangeViewMode("advanced")}
              className={`cursor-pointer rounded px-2.5 py-1 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB] ${
                viewMode === "advanced"
                  ? "bg-[#FFFFFF] font-semibold text-[#0F172A] shadow-xs"
                  : "text-[#475569] hover:text-[#0F172A]"
              }`}
            >
              Advanced
            </button>
          </div>

          <div
            role="button"
            tabIndex={0}
            draggable
            title="Drag onto any airport beacon on the India map"
            aria-label="Drag storm cell onto any airport"
            onDragStart={(e) => {
              e.dataTransfer.setData("application/x-domino-storm", "90");
              e.dataTransfer.effectAllowed = "copy";
              onStormDragState(true);
            }}
            onDragEnd={() => onStormDragState(false)}
            className="hidden h-8 cursor-grab items-center gap-1.5 rounded-md border border-dashed border-[#FCA5A5] bg-[#FEF2F2] px-2.5 text-xs font-semibold text-[#B91C1C] transition-colors duration-150 hover:bg-[#FEE2E2] active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB] lg:flex"
          >
            <CloudLightning className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Drag Storm</span>
          </div>
        </div>

        <div className="flex h-full items-center gap-1.5 px-3">
          <button
            type="button"
            onClick={onOpenCrisisModal}
            className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-[#E6EBF2] bg-[#FFFFFF] px-2.5 text-xs font-medium text-[#0F172A] transition-colors duration-150 hover:bg-[#F8FAFC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB]"
          >
            <Terminal className="h-3.5 w-3.5 text-[#1D4ED8]" aria-hidden="true" />
            <span className="hidden sm:inline">Crisis</span>
            <kbd className="hidden rounded border border-[#E6EBF2] bg-[#FBFCFD] px-1 font-mono text-[10px] text-[#475569] xl:inline">
              ⌘K
            </kbd>
          </button>

          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo last action"
            className="flex h-8 cursor-pointer items-center gap-1 rounded-md border border-[#E6EBF2] bg-[#FFFFFF] px-2 text-xs font-medium text-[#0F172A] transition-colors duration-150 hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB]"
          >
            <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden lg:inline">Undo</span>
          </button>

          <button
            type="button"
            onClick={onReset}
            title="Reset to Clear Skies"
            aria-label="Reset scenario to Clear Skies"
            className="flex h-8 cursor-pointer items-center gap-1 rounded-md border border-[#E6EBF2] bg-[#FFFFFF] px-2 text-xs font-medium text-[#475569] transition-colors duration-150 hover:bg-[#F8FAFC] hover:text-[#0F172A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB]"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={onToggleDispatcher}
            aria-expanded={isDispatcherOpen}
            className={`flex h-8 cursor-pointer items-center gap-1.5 rounded-md bg-[#1D4ED8] px-3 text-xs font-semibold text-white transition-colors duration-150 hover:bg-[#1E40AF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB] ${
              isDispatcherOpen ? "ring-2 ring-[#2B79FB]/30" : ""
            }`}
          >
            <Cpu className="h-3.5 w-3.5" aria-hidden="true" />
            <span>AI Helper</span>
            {candidateCount > 0 && (
              <span className="rounded-full bg-[#EFF6FF] px-1.5 py-0.2 font-mono text-[10px] font-bold text-[#1D4ED8]">
                {candidateCount}
              </span>
            )}
          </button>
        </div>

        {onToggleFullscreenMap && (
          <div className="flex h-full items-center px-2">
            <button
              type="button"
              onClick={onToggleFullscreenMap}
              aria-label="Toggle full-bleed map"
              aria-pressed={isMapExpanded}
              title={isMapExpanded ? "Show AI Helper" : "Expand map"}
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-[#475569] transition-colors duration-150 hover:bg-[#F8FAFC] hover:text-[#0F172A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB]"
            >
              {isMapExpanded ? (
                <Minimize2 className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Maximize2 className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
