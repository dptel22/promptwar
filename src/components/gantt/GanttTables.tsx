/**
 * Tabular detail views for passenger connections and crew duty legality
 * rendered inside the TailChainGantt inspection dock.
 */

"use client";

import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import { formatHHMM } from "@/lib/sim/constants";
import type { SimulatedConnection, SimulatedCrew } from "@/lib/sim/types";

/** Props accepted by `ConnectionsTable`. */
export interface ConnectionsTableProps {
  connections: SimulatedConnection[];
  onSelectFlight: (flightId: string) => void;
}

/** Props accepted by `CrewsTable`. */
export interface CrewsTableProps {
  crews: SimulatedCrew[];
  onSelectFlight: (flightId: string) => void;
}

function handleRowKey(e: React.KeyboardEvent, callback: () => void) {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    callback();
  }
}

/**
 * Displays all passenger transfers sorted by disruption severity and passenger count.
 */
export function ConnectionsTable({ connections, onSelectFlight }: ConnectionsTableProps) {
  const sortedConnections = useMemo(() => {
    const rank = (s: string) => (s === "BROKEN_GROUNDED" ? 0 : s === "BROKEN_TIME" ? 1 : 2);
    return [...connections].sort((a, b) =>
      rank(a.status) !== rank(b.status) ? rank(a.status) - rank(b.status) : b.passengers - a.passengers
    );
  }, [connections]);

  return (
    <div className="flex-1 overflow-y-auto bg-[#FFFFFF]">
      <table className="w-full border-collapse text-left text-xs">
        <thead className="sticky top-0 bg-[#FBFCFD] font-mono text-[10px] text-[#475569]">
          <tr className="border-b border-[#E6EBF2]">
            <th className="px-3 py-1.5">ID</th>
            <th className="px-3 py-1.5">Hub</th>
            <th className="px-3 py-1.5">Transfer</th>
            <th className="px-3 py-1.5">Pax</th>
            <th className="px-3 py-1.5">Min MCT</th>
            <th className="px-3 py-1.5">Actual</th>
            <th className="px-3 py-1.5">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#E6EBF2]">
          {sortedConnections.map((cx) => (
            <tr
              key={cx.connection_id}
              tabIndex={0}
              onClick={() => onSelectFlight(cx.from_flight)}
              onKeyDown={(e) => handleRowKey(e, () => onSelectFlight(cx.from_flight))}
              className="cursor-pointer hover:bg-[#FBFCFD] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2B79FB]"
            >
              <td className="px-3 py-1.5 font-mono font-semibold text-[#0F172A]">{cx.connection_id}</td>
              <td className="px-3 py-1.5 font-mono text-[#475569]">{cx.airport}</td>
              <td className="px-3 py-1.5 font-mono text-[#0F172A]">{cx.from_flight} → {cx.to_flight}</td>
              <td className="px-3 py-1.5 font-mono tabular-nums text-[#0F172A]">{cx.passengers}</td>
              <td className="px-3 py-1.5 font-mono tabular-nums text-[#475569]">{cx.min_connect_minutes}m</td>
              <td className="px-3 py-1.5 font-mono tabular-nums text-[#0F172A]">
                {cx.actualConnectMin !== null ? `${cx.actualConnectMin}m` : "Grounded"}
              </td>
              <td className="px-3 py-1.5 font-mono text-[11px] font-semibold">
                {cx.status === "INTACT" ? (
                  <span className="text-[#047857]">INTACT</span>
                ) : cx.status === "BROKEN_GROUNDED" ? (
                  <span className="text-[#B91C1C]">GROUNDED</span>
                ) : (
                  <span className="text-[#B91C1C]">MISSED (-{cx.shortfallMin}m)</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Displays all operating crew duty windows sorted by 600-minute legal breach severity.
 */
export function CrewsTable({ crews, onSelectFlight }: CrewsTableProps) {
  const sortedCrews = useMemo(
    () =>
      [...crews].sort((a, b) =>
        a.breached !== b.breached
          ? a.breached ? -1 : 1
          : b.projectedEndMin - b.dutyLimitMin - (a.projectedEndMin - a.dutyLimitMin)
      ),
    [crews]
  );

  return (
    <div className="flex-1 overflow-y-auto bg-[#FFFFFF]">
      <table className="w-full border-collapse text-left text-xs">
        <thead className="sticky top-0 bg-[#FBFCFD] font-mono text-[10px] text-[#475569]">
          <tr className="border-b border-[#E6EBF2]">
            <th className="px-3 py-1.5">Crew</th>
            <th className="px-3 py-1.5">Tail</th>
            <th className="px-3 py-1.5">Base</th>
            <th className="px-3 py-1.5">Start</th>
            <th className="px-3 py-1.5">Cutoff (600m)</th>
            <th className="px-3 py-1.5">Projected End</th>
            <th className="px-3 py-1.5">Legality</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#E6EBF2]">
          {sortedCrews.map((cr) => {
            const breachFid = cr.breachFlightId;
            return (
              <tr
                key={cr.crewId}
                tabIndex={breachFid ? 0 : undefined}
                onClick={() => { if (breachFid) onSelectFlight(breachFid); }}
                onKeyDown={(e) => { if (breachFid) handleRowKey(e, () => onSelectFlight(breachFid)); }}
                className={`${breachFid ? "cursor-pointer" : ""} hover:bg-[#FBFCFD] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2B79FB]`}
              >
                <td className="px-3 py-1.5 font-mono font-semibold text-[#0F172A]">{cr.crewId}</td>
                <td className="px-3 py-1.5 font-mono text-[#475569]">{cr.tailId}</td>
                <td className="px-3 py-1.5 font-mono text-[#475569]">{cr.base}</td>
                <td className="px-3 py-1.5 font-mono tabular-nums text-[#0F172A]">{formatHHMM(cr.dutyStartMin)}</td>
                <td className="px-3 py-1.5 font-mono tabular-nums text-[#0F172A]">{formatHHMM(cr.dutyLimitMin)}</td>
                <td className="px-3 py-1.5 font-mono tabular-nums text-[#0F172A]">{formatHHMM(cr.projectedEndMin)}</td>
                <td className="px-3 py-1.5 font-mono text-[11px] font-semibold">
                  {cr.breached ? (
                    <span className="inline-flex items-center gap-1 text-[#B91C1C]">
                      <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                      BREACH +{cr.overtimeMin}m ({cr.breachFlightId})
                    </span>
                  ) : (
                    <span className="text-[#047857]">LEGAL</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
