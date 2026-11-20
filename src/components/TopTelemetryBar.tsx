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
import { parseHHMM } from "@/lib/sim/engine";
import type { AirportClosure } from "@/lib/sim/types";

export interface ScenarioPreset {
  id: string;
  label: string;
  clockMin: number;
  closures: AirportClosure[];
}

export const SCENARIO_PRESETS: ScenarioPreset[] = [
  {
    id: "bom-90m",
    label: "BOM 90m Thunderstorm (07:30–09:00)",
    clockMin: parseHHMM("08:35"),
    closures: [
      {
        id: "preset-bom-90",
        airportId: "BOM",
        startMin: parseHHMM("07:30"),
        endMin: parseHHMM("09:00"),
        label: "BOM Thunderstorm",
      },
    ],
  },
  {
    id: "bom-20m-buffer",
    label: "BOM 20m Buffer Test (07:30–07:50)",
    clockMin: parseHHMM("08:30"),
    closures: [
      {
        id: "preset-bom-20",
        airportId: "BOM",
        startMin: parseHHMM("07:30"),
        endMin: parseHHMM("07:50"),
        label: "BOM Minor Hold",
      },
    ],
  },
  {
    id: "bom-110m-cascade",
    label: "BOM 110m Cascade (07:30–09:20)",
    clockMin: parseHHMM("09:30"),
    closures: [
      {
        id: "preset-bom-110",
        airportId: "BOM",
        startMin: parseHHMM("07:30"),
        endMin: parseHHMM("09:20"),
        label: "BOM Severe Storm",
      },
    ],
  },
  {
    id: "del-60m-fog",
    label: "DEL 60m Winter Fog (11:15–12:15)",
    clockMin: parseHHMM("11:35"),
    closures: [
      {
        id: "preset-del-fog",
        airportId: "DEL",
        startMin: parseHHMM("11:15"),
        endMin: parseHHMM("12:15"),
        label: "DEL Winter Fog",
      },
    ],
  },
  {
    id: "gau-spoke",
    label: "GAU Spoke Isolation (17:00–19:45)",
    clockMin: parseHHMM("18:15"),
    closures: [
      {
        id: "preset-gau",
        airportId: "GAU",
        startMin: parseHHMM("17:00"),
        endMin: parseHHMM("19:45"),
        label: "GAU Fog Closure",
      },
    ],
  },
  {
    id: "hyd-75m",
    label: "HYD 75m Squall (12:00–13:15)",
    clockMin: parseHHMM("12:45"),
    closures: [
      {
        id: "preset-hyd",
        airportId: "HYD",
        startMin: parseHHMM("12:00"),
        endMin: parseHHMM("13:15"),
        label: "HYD Squall",
      },
    ],
  },
  {
    id: "bom-pm-crew",
    label: "BOM PM Crew Cutoff (15:00–16:30)",
    clockMin: parseHHMM("16:40"),
    closures: [
      {
        id: "preset-bom-pm",
        airportId: "BOM",
        startMin: parseHHMM("15:00"),
        endMin: parseHHMM("16:30"),
        label: "BOM PM Storm",
      },
    ],
  },
  {
    id: "bom-del-dual",
    label: "BOM + DEL Dual Hub Crisis",
    clockMin: parseHHMM("08:35"),
    closures: [
      {
        id: "preset-dual-bom",
        airportId: "BOM",
        startMin: parseHHMM("07:30"),
        endMin: parseHHMM("09:00"),
        label: "BOM Storm",
      },
      {
        id: "preset-dual-del",
        airportId: "DEL",
        startMin: parseHHMM("15:00"),
        endMin: parseHHMM("16:30"),
        label: "DEL Storm",
      },
    ],
  },
  {
    id: "clear-skies",
    label: "Clear Skies (Nominal Schedule)",
    clockMin: parseHHMM("09:15"),
    closures: [],
  },
];

interface TopTelemetryBarProps {
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
      {/* Left Cell: Brand & Minimal Route Navigation */}
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

      {/* Right Segmented Hairline Cells */}
      <div className="flex h-full items-center divide-x divide-[#E6EBF2] border-l border-[#E6EBF2]">
        {/* Scenario Picker, Complexity Switch & Drag Storm */}
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

        {/* Actions Cell: Crisis, Undo, Reset, AI Dispatcher */}
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
            <span>AI Dispatcher</span>
            {candidateCount > 0 && (
              <span className="rounded-full bg-[#EFF6FF] px-1.5 py-0.2 font-mono text-[10px] font-bold text-[#1D4ED8]">
                {candidateCount}
              </span>
            )}
          </button>
        </div>

        {/* Far-Right Segmented Expand / Collapse Cell */}
        {onToggleFullscreenMap && (
          <div className="flex h-full items-center px-2">
            <button
              type="button"
              onClick={onToggleFullscreenMap}
              aria-label="Toggle full-bleed map"
              aria-pressed={isMapExpanded}
              title={isMapExpanded ? "Show AI Dispatcher" : "Expand map"}
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
