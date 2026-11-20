"use client";

import {
  AlertTriangle,
  CloudLightning,
  Cpu,
  Radar,
  RotateCcw,
  Terminal,
  Undo2,
  Users,
} from "lucide-react";
import { parseHHMM } from "@/lib/sim/engine";
import type {
  AirportClosure,
  RecoveryAction,
  RecoveryCandidate,
  SimulationResult,
} from "@/lib/sim/types";

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
    label: "Stress #1A: BOM 20m Buffer Test (07:30–07:50)",
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
    label: "Stress #1B: BOM 110m Cascade (07:30–09:20)",
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
    id: "gau-spoke",
    label: "Stress #2: GAU Spoke Isolation (17:00–19:45)",
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
    label: "Stress #4: HYD 75m Unscripted (12:00–13:15)",
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
    label: "BOM PM Crew Duty Breach (15:00–16:30)",
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
    clockMin: parseHHMM("11:45"),
    closures: [
      {
        id: "preset-dual-bom",
        airportId: "BOM",
        startMin: parseHHMM("08:00"),
        endMin: parseHHMM("09:30"),
        label: "BOM Storm",
      },
      {
        id: "preset-dual-del",
        airportId: "DEL",
        startMin: parseHHMM("11:15"),
        endMin: parseHHMM("12:15"),
        label: "DEL Fog",
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
  simulation: SimulationResult;
  previewCandidate: RecoveryCandidate | null;
  activeActions: RecoveryAction[];
  canUndo: boolean;
  isCrisisBarOpen: boolean;
  isDispatcherOpen: boolean;
  onSelectPreset: (presetId: string) => void;
  onToggleCrisisBar: () => void;
  onUndo: () => void;
  onReset: () => void;
  onToggleDispatcher: () => void;
  onStormDragState: (dragging: boolean) => void;
}

export function TopTelemetryBar({
  activePresetId,
  closures,
  simulation,
  previewCandidate,
  activeActions,
  canUndo,
  isCrisisBarOpen,
  isDispatcherOpen,
  onSelectPreset,
  onToggleCrisisBar,
  onUndo,
  onReset,
  onToggleDispatcher,
  onStormDragState,
}: TopTelemetryBarProps) {
  const m = simulation.metrics;
  const pm = previewCandidate?.result.metrics;

  return (
    <header className="flex h-14 w-full shrink-0 items-center justify-between gap-3 border-b border-[#222C38] bg-[#11161D] px-3 lg:px-4">
      {/* Left: Brand, Scenario Selector, Draggable Storm Cell, Crisis AI */}
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="flex shrink-0 items-center gap-2 pr-1">
          <span className="flex h-7 w-7 items-center justify-center rounded-md border border-amber-500/40 bg-[#18202A]">
            <Radar className="h-4 w-4 text-amber-400" aria-hidden="true" />
          </span>
          <div className="leading-none">
            <h1 className="font-display text-sm font-bold tracking-wide text-[#F1F5F9]">
              DOMINO SKY
            </h1>
            <span className="font-mono text-[10px] text-[#94A3B8]">
              OCC RADAR · 16 AIRPORTS
            </span>
          </div>
        </div>

        <div className="h-6 w-px bg-[#222C38]" aria-hidden="true" />

        <div className="flex items-center gap-1.5">
          <label htmlFor="scenario-select" className="sr-only">
            Select disruption scenario preset
          </label>
          <select
            id="scenario-select"
            value={activePresetId}
            onChange={(e) => onSelectPreset(e.target.value)}
            className="h-8 max-w-[215px] cursor-pointer truncate rounded-md border border-[#222C38] bg-[#18202A] px-2.5 text-xs font-medium text-[#F1F5F9] transition-colors duration-150 hover:border-amber-500/50 hover:bg-[#1F2937] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
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

          {/* Draggable Storm Cell Token */}
          <div
            role="button"
            tabIndex={0}
            draggable
            title="Drag onto any airport on the radar to trigger a 90-minute storm closure"
            aria-label="Draggable 90-minute storm cell. Drag onto any airport on the map."
            onDragStart={(e) => {
              e.dataTransfer.setData("application/x-domino-storm", "90");
              e.dataTransfer.effectAllowed = "copy";
              onStormDragState(true);
            }}
            onDragEnd={() => onStormDragState(false)}
            className="hidden cursor-grab items-center gap-1.5 rounded-md border border-dashed border-red-500/60 bg-[#18202A] px-2.5 py-1.5 text-xs font-medium text-[#F87171] transition-colors duration-150 hover:border-red-400 hover:bg-[#1F2937] active:cursor-grabbing sm:flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            <CloudLightning className="h-3.5 w-3.5 text-red-400" aria-hidden="true" />
            <span className="whitespace-nowrap">Drag Storm</span>
          </div>

          <button
            type="button"
            onClick={onToggleCrisisBar}
            aria-expanded={isCrisisBarOpen}
            className={`flex h-8 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
              isCrisisBarOpen
                ? "border-amber-500 bg-[#1F2937] text-[#FBBF24]"
                : "border-[#222C38] bg-[#18202A] text-[#F1F5F9] hover:border-slate-500 hover:bg-[#1F2937]"
            }`}
          >
            <Terminal className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
            <span className="hidden whitespace-nowrap xl:inline">Crisis Prompt</span>
            <span className="whitespace-nowrap xl:hidden">Prompt</span>
          </button>
        </div>
      </div>

      {/* Center: Live Tabular KPI Strip (with Before -> After Ghost Deltas) */}
      <div
        className="flex shrink-0 items-center gap-2 rounded-md border border-[#222C38] bg-[#090D12] px-2.5 py-1"
        aria-label="Network disruption telemetry"
      >
        <KpiCell
          label="Delayed"
          value={m.delayedFlights}
          previewValue={pm?.delayedFlights}
          tone={m.delayedFlights > 0 ? "amber" : "emerald"}
        />
        <div className="h-5 w-px bg-[#222C38]" aria-hidden="true" />
        <KpiCell
          label="Stranded Pax"
          value={m.totalStrandedPax}
          previewValue={pm?.totalStrandedPax}
          tone={m.totalStrandedPax > 0 ? "crimson" : "emerald"}
          icon={<Users className="h-3 w-3" aria-hidden="true" />}
        />
        <div className="h-5 w-px bg-[#222C38]" aria-hidden="true" />
        <KpiCell
          label="Crew Breach"
          value={m.crewBreaches}
          previewValue={pm?.crewBreaches}
          tone={m.crewBreaches > 0 ? "crimson" : "emerald"}
          icon={
            m.crewBreaches > 0 ? (
              <AlertTriangle className="h-3 w-3 text-red-400" aria-hidden="true" />
            ) : undefined
          }
        />
        <div className="hidden h-5 w-px bg-[#222C38] lg:block" aria-hidden="true" />
        <div className="hidden lg:block">
          <KpiCell
            label="Total Delay"
            value={`${m.totalDelayMinutes}m`}
            previewValue={pm ? `${pm.totalDelayMinutes}m` : undefined}
            isImproved={pm ? pm.totalDelayMinutes < m.totalDelayMinutes : false}
            tone={m.totalDelayMinutes > 0 ? "amber" : "emerald"}
          />
        </div>
      </div>

      {/* Right: Undo, Reset, AI Dispatcher */}
      <div className="flex shrink-0 items-center gap-1.5">
        {activeActions.length > 0 && (
          <span className="hidden rounded-sm border border-emerald-500/40 bg-emerald-950/50 px-1.5 py-0.5 font-mono text-[10px] font-medium text-[#34D399] xl:inline-block">
            {activeActions.length} RECOVERY ACTIVE
          </span>
        )}
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo last closure or recovery action"
          className="flex h-8 cursor-pointer items-center gap-1 rounded-md border border-[#222C38] bg-[#18202A] px-2 text-xs font-medium text-[#F1F5F9] transition-colors duration-150 hover:bg-[#1F2937] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
        >
          <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden md:inline">Undo</span>
        </button>

        <button
          type="button"
          onClick={onReset}
          title="Clear all closures and recovery actions"
          className="flex h-8 cursor-pointer items-center gap-1 rounded-md border border-[#222C38] bg-[#18202A] px-2 text-xs font-medium text-[#94A3B8] transition-colors duration-150 hover:bg-[#1F2937] hover:text-[#F1F5F9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden lg:inline">Clear</span>
        </button>

        <button
          type="button"
          onClick={onToggleDispatcher}
          aria-expanded={isDispatcherOpen}
          className={`flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
            isDispatcherOpen
              ? "border border-amber-400 bg-amber-400 text-[#090D12]"
              : "border border-amber-500 bg-[#F59E0B] text-[#090D12] hover:bg-amber-400"
          }`}
        >
          <Cpu className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="whitespace-nowrap">AI Dispatcher</span>
        </button>
      </div>
    </header>
  );
}

function KpiCell({
  label,
  value,
  previewValue,
  isImproved,
  tone,
  icon,
}: {
  label: string;
  value: number | string;
  previewValue?: number | string;
  isImproved?: boolean;
  tone: "emerald" | "amber" | "crimson";
  icon?: React.ReactNode;
}) {
  const toneClass =
    tone === "crimson"
      ? "text-[#F87171]"
      : tone === "amber"
        ? "text-[#FBBF24]"
        : "text-[#34D399]";

  const showPreview =
    previewValue !== undefined && previewValue !== value;

  const improved =
    isImproved !== undefined
      ? isImproved
      : typeof previewValue === "number" &&
        typeof value === "number" &&
        previewValue < value;

  return (
    <div className="flex flex-col px-1 leading-tight">
      <span className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-[#94A3B8]">
        {icon}
        {label}
      </span>
      <div className="flex items-baseline gap-1 font-mono text-xs font-semibold tabular-nums">
        <span className={showPreview ? "text-[#94A3B8] line-through" : toneClass}>
          {value}
        </span>
        {showPreview && (
          <span className={improved ? "text-[#34D399]" : "text-[#FBBF24]"}>
            → {previewValue}
          </span>
        )}
      </div>
    </div>
  );
}
