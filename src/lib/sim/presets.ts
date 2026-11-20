/**
 * Curated Indian weather disruption presets shared by the landing showcase and
 * the interactive OCC simulator.
 */

import { parseHHMM } from "./constants";
import type { AirportClosure } from "./types";

/** Preconfigured scenario preset pairing closures with a representative IST clock. */
export interface ScenarioPreset {
  id: string;
  label: string;
  clockMin: number;
  closures: AirportClosure[];
}

/** Built-in single-hub, spoke-isolation, dual-hub, and baseline presets. */
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
