import { DATASET, formatHHMM } from "./engine";
import type { AirportClosure } from "./types";

const AIRPORT_ALIASES: Array<[string, string]> = [
  ["thiruvananthapuram", "TRV"],
  ["trivandrum", "TRV"],
  ["bhubaneswar", "BBI"],
  ["chandigarh", "IXC"],
  ["ahmedabad", "AMD"],
  ["hyderabad", "HYD"],
  ["bengaluru", "BLR"],
  ["bangalore", "BLR"],
  ["guwahati", "GAU"],
  ["lucknow", "LKO"],
  ["chennai", "MAA"],
  ["madras", "MAA"],
  ["kolkata", "CCU"],
  ["calcutta", "CCU"],
  ["mumbai", "BOM"],
  ["bombay", "BOM"],
  ["jaipur", "JAI"],
  ["delhi", "DEL"],
  ["kochi", "COK"],
  ["cochin", "COK"],
  ["pune", "PNQ"],
  ["goa", "GOI"],
];

const VALID_IATA = new Set(DATASET.airports.map((a) => a.id));

function toMinutes24(hourRaw: number, minRaw: number, meridiem?: string): number {
  let hour = hourRaw;
  if (meridiem) {
    const m = meridiem.toLowerCase();
    if (m === "pm" && hour < 12) hour += 12;
    if (m === "am" && hour === 12) hour = 0;
  }
  return Math.max(300, Math.min(1380, hour * 60 + minRaw));
}

function findAirportsInSegment(segment: string): string[] {
  const found: Array<{ idx: number; code: string }> = [];
  const upper = segment.toUpperCase();
  const lower = segment.toLowerCase();

  for (const code of VALID_IATA) {
    const re = new RegExp(`\\b${code}\\b`, "g");
    for (const m of upper.matchAll(re)) {
      if (m.index !== undefined) found.push({ idx: m.index, code });
    }
  }

  for (const [alias, code] of AIRPORT_ALIASES) {
    const re = new RegExp(`\\b${alias}\\b`, "g");
    for (const m of lower.matchAll(re)) {
      if (m.index !== undefined) found.push({ idx: m.index, code });
    }
  }

  found.sort((a, b) => a.idx - b.idx);
  const deduped: string[] = [];
  for (const item of found) {
    if (!deduped.includes(item.code)) deduped.push(item.code);
  }
  return deduped;
}

function parseTimeWindow(segment: string): { startMin: number; endMin: number } {
  // Range: "08:00-09:30" or "10am to 11am" or "7:30am - 9:00am"
  const rangeRe =
    /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|–|to)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i;
  const rangeMatch = segment.match(rangeRe);
  if (rangeMatch) {
    const h1 = Number(rangeMatch[1]);
    const m1 = Number(rangeMatch[2] ?? "0");
    const mer1 = rangeMatch[3] ?? rangeMatch[6];
    const h2 = Number(rangeMatch[4]);
    const m2 = Number(rangeMatch[5] ?? "0");
    const mer2 = rangeMatch[6] ?? rangeMatch[3];
    const startMin = toMinutes24(h1, m1, mer1);
    let endMin = toMinutes24(h2, m2, mer2);
    if (endMin <= startMin) endMin = Math.min(1380, startMin + 90);
    return { startMin, endMin };
  }

  // Duration + single start time: "90 min ... at 7:30am" or "at 12:00 for 75 minutes"
  const durRe = /\b(\d{1,3})\s*(?:min|mins|minute|minutes|m|hr|hrs|hour|hours|h)\b/i;
  const durMatch = segment.match(durRe);
  let durationMin = 90;
  if (durMatch) {
    const val = Number(durMatch[1]);
    const unit = durMatch[0].toLowerCase();
    durationMin =
      unit.includes("hr") || unit.includes("hour") || /\dh$/i.test(durMatch[0])
        ? val * 60
        : val;
    durationMin = Math.max(15, Math.min(360, durationMin));
  }

  const singleTimeRe = /\b(?:at\s+|from\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/gi;
  for (const m of segment.matchAll(singleTimeRe)) {
    const rawHour = Number(m[1]);
    const hasColon = m[2] !== undefined;
    const hasMeridiem = m[3] !== undefined;
    const hasPrefix = m[0].toLowerCase().startsWith("at") || m[0].toLowerCase().startsWith("from");
    if (!hasColon && !hasMeridiem && !hasPrefix) continue;
    if (rawHour > 23) continue;
    const startMin = toMinutes24(rawHour, Number(m[2] ?? "0"), m[3]);
    return {
      startMin,
      endMin: Math.min(1380, startMin + durationMin),
    };
  }

  return { startMin: 480, endMin: 480 + durationMin };
}

export function parseCrisisDeterministic(text: string): {
  closures: AirportClosure[];
  summary: string;
} {
  const segments = text
    .split(/\b(?:and|then|plus)\b|[;,]/i)
    .map((s) => s.trim())
    .filter(Boolean);

  const closures: AirportClosure[] = [];
  const usedAirports = new Set<string>();

  for (const seg of segments) {
    const airports = findAirportsInSegment(seg);
    if (airports.length === 0) continue;
    const window = parseTimeWindow(seg);

    for (const airportId of airports) {
      if (usedAirports.has(`${airportId}-${window.startMin}`)) continue;
      usedAirports.add(`${airportId}-${window.startMin}`);
      closures.push({
        id: `crisis-${airportId}-${window.startMin}`,
        airportId,
        startMin: window.startMin,
        endMin: window.endMin,
      });
    }
  }

  // Fallback across whole string if split hid airport/time in separate halves
  if (closures.length === 0) {
    const airports = findAirportsInSegment(text);
    const window = parseTimeWindow(text);
    for (const airportId of airports) {
      closures.push({
        id: `crisis-${airportId}-${window.startMin}`,
        airportId,
        startMin: window.startMin,
        endMin: window.endMin,
      });
    }
  }

  const summary =
    closures.length > 0
      ? `Compiled ${closures.length} closure(s): ${closures
          .map((c) => `${c.airportId} ${formatHHMM(c.startMin)}–${formatHHMM(c.endMin)} IST`)
          .join(", ")}.`
      : "No matching airport found. Mention a city or IATA code (e.g. Mumbai/BOM, Delhi/DEL, HYD).";

  return { closures, summary };
}
