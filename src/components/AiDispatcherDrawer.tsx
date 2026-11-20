/**
 * Calm, scannable AI Helper drawer presenting a 1-line network status,
 * active recovery undo bar, #1 Best Fix hero card, collapsible alternatives,
 * and a docked bottom Quick-Ask Bar with inline live answers.
 */

"use client";

import { memo, useEffect, useState } from "react";
import {
  CheckCircle2, ChevronDown, ChevronUp, Cpu, Eye, RefreshCw, Send, ShieldCheck, Undo2, X,
} from "lucide-react";
import { answerDispatcherQuery, type DispatcherQueryResponse } from "@/lib/sim/recovery";
import type {
  AirportClosure, DispatcherBriefing, RecoveryAction, RecoveryCandidate,
  RecoveryEvaluation, SimulationResult,
} from "@/lib/sim/types";

/** Props accepted by the right-hand `AiDispatcherDrawer` panel. */
export interface AiDispatcherDrawerProps {
  isOpen: boolean;
  viewMode: "simple" | "advanced";
  loading: boolean;
  mode: "ai_verified" | "deterministic_engine";
  evaluation: RecoveryEvaluation | null;
  briefing: DispatcherBriefing | null;
  activeActions: RecoveryAction[];
  previewCandidateId: string | null;
  onPreviewCandidate: (candidate: RecoveryCandidate | null) => void;
  onApplyCandidate: (candidate: RecoveryCandidate) => void;
  onUndoRecovery: () => void;
  onRefresh: () => void;
  onClose: () => void;
  onApplySuggestedClosures?: (closures: AirportClosure[]) => void;
  onFocusFlight?: (flightId: string) => void;
  onFocusAirport?: (airportId: string) => void;
}

interface HeroKpi {
  label: string;
  valueText: string;
  positive: boolean;
}

function formatHeroHeadline(candidate: RecoveryCandidate): string {
  const { strandedPaxDelta, crewBreachesDelta, totalDelayMinutesDelta } = candidate.deltas;
  if (strandedPaxDelta < 0) {
    const saved = Math.abs(strandedPaxDelta);
    return `Save ${saved} connecting passenger${saved === 1 ? "" : "s"}`;
  }
  if (crewBreachesDelta < 0) {
    const fixed = Math.abs(crewBreachesDelta);
    return `Fix ${fixed} legal crew breach${fixed === 1 ? "" : "es"}`;
  }
  if (totalDelayMinutesDelta < 0) return `Cut ${Math.abs(totalDelayMinutesDelta)}m of network delay`;
  return candidate.title;
}

function buildHeroKpis(baseline: SimulationResult, candidate: RecoveryCandidate): HeroKpi[] {
  const m = baseline.metrics;
  const rm = candidate.result.metrics;
  const kpis: HeroKpi[] = [];
  if (m.totalStrandedPax > 0 || rm.totalStrandedPax > 0) {
    kpis.push({ label: "Stranded pax", valueText: `${m.totalStrandedPax} → ${rm.totalStrandedPax}`, positive: candidate.deltas.strandedPaxDelta <= 0 });
  }
  if (m.crewBreaches > 0 || rm.crewBreaches > 0) {
    kpis.push({ label: "Crew breaches", valueText: `${m.crewBreaches} → ${rm.crewBreaches}`, positive: candidate.deltas.crewBreachesDelta <= 0 });
  }
  if (kpis.length < 3 && (m.delayedFlights > 0 || rm.delayedFlights > 0)) {
    kpis.push({ label: "Delayed", valueText: `${m.delayedFlights} → ${rm.delayedFlights}`, positive: candidate.deltas.delayedFlightsDelta <= 0 });
  }
  if (kpis.length < 3 && candidate.deltas.totalDelayMinutesDelta !== 0) {
    const d = candidate.deltas.totalDelayMinutesDelta;
    kpis.push({ label: "Net delay", valueText: `${d > 0 ? "+" : ""}${d}m`, positive: d <= 0 });
  }
  if (kpis.length < 2 && (m.onTimeFlights > 0 || rm.onTimeFlights > 0)) {
    kpis.push({ label: "On time", valueText: `${m.onTimeFlights} → ${rm.onTimeFlights}`, positive: rm.onTimeFlights >= m.onTimeFlights });
  }
  return kpis.slice(0, 3);
}

/**
 * Renders the calm AI Helper side drawer with single-fix prioritization,
 * collapsible alternatives, and a docked bottom Quick-Ask console.
 */
export const AiDispatcherDrawer = memo(function AiDispatcherDrawer({
  isOpen, viewMode, loading, mode, evaluation, briefing, activeActions, previewCandidateId,
  onPreviewCandidate, onApplyCandidate, onUndoRecovery, onRefresh, onClose,
  onApplySuggestedClosures, onFocusFlight, onFocusAirport,
}: AiDispatcherDrawerProps) {
  const [showAlternatives, setShowAlternatives] = useState(viewMode === "advanced");
  const [queryText, setQueryText] = useState("");
  const [lastQueryEntry, setLastQueryEntry] = useState<{
    contextKey: string;
    prompt: string;
    response: DispatcherQueryResponse;
  } | null>(null);

  useEffect(() => {
    setShowAlternatives(viewMode === "advanced");
  }, [viewMode]);

  if (!isOpen) return null;

  const candidates = evaluation?.candidates ?? [];
  const baseline = evaluation?.baseline;
  const closures = evaluation?.closures ?? [];
  const contextKey = `${closures.map((c) => `${c.airportId}:${c.startMin}-${c.endMin}`).join("|")}::${activeActions.map((a) => a.id).join(",")}`;
  const activeQueryResult = lastQueryEntry && lastQueryEntry.contextKey === contextKey ? lastQueryEntry : null;

  const recommended = candidates.find((c) => c.id === briefing?.recommendedCandidateId) ?? candidates[0];
  const alternatives = candidates.filter((c) => c.id !== recommended?.id);
  const statusLine = briefing?.executiveSummary ?? (
    baseline
      ? baseline.metrics.delayedFlights === 0
        ? "All 70 flights operating on schedule."
        : `${baseline.metrics.delayedFlights} delayed flights · ${baseline.metrics.totalStrandedPax} stranded pax · ${baseline.metrics.crewBreaches} crew breaches.`
      : "Monitoring 70 single-day flights."
  );

  function executeQuery(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed || !evaluation) return;
    const response = answerDispatcherQuery(trimmed, evaluation.baseline, evaluation.closures, activeActions);
    setLastQueryEntry({ contextKey, prompt: trimmed, response });
    setQueryText("");
  }

  const heroKpis = recommended && baseline ? buildHeroKpis(baseline, recommended) : [];
  const qr = activeQueryResult?.response;
  const suggestedClosures = qr?.suggestedClosures;
  const focusFlightId = qr?.focusFlightId;
  const focusAirportId = qr?.focusAirportId;

  return (
    <aside aria-label="AI Helper" className="flex h-full w-full shrink-0 flex-col border-l border-[#E6EBF2] bg-[#FFFFFF] sm:w-[356px]">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-[#E6EBF2] px-4">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-sm font-bold text-[#0F172A]">AI Helper</h2>
          {mode === "ai_verified" ? (
            <span className="inline-flex items-center gap-1 rounded-sm border border-[#047857]/30 bg-[#ECFDF5] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#047857]">
              <ShieldCheck className="h-3 w-3" aria-hidden="true" />Verified AI
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-sm border border-[#2B79FB]/30 bg-[#EFF6FF] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#1D4ED8]">
              <Cpu className="h-3 w-3" aria-hidden="true" />Engine
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={onRefresh} disabled={loading} aria-label="Re-evaluate recovery plans" className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB]">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
          </button>
          <button type="button" onClick={onClose} aria-label="Close AI Helper" className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB]">
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="flex-1 divide-y divide-[#E6EBF2] overflow-y-auto">
        <div className="px-4 py-3">
          <p className="truncate text-xs text-[#475569]" title={statusLine}>{statusLine}</p>
          {activeActions.length > 0 && (
            <div className="mt-2.5 flex items-center justify-between gap-2 rounded-lg border border-[#047857]/25 bg-[#ECFDF5]/70 px-2.5 py-2">
              <div className="min-w-0">
                <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#047857]">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>{activeActions.length} recovery applied</span>
                </div>
                <p className="truncate font-mono text-[10.5px] text-[#0F172A]">{activeActions.map((a) => a.label).join(" · ")}</p>
              </div>
              <button type="button" onClick={onUndoRecovery} className="flex shrink-0 cursor-pointer items-center gap-1 rounded-md border border-[#CBD5E1] bg-[#FFFFFF] px-2 py-1 text-xs font-medium text-[#0F172A] hover:bg-[#F1F5F9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB]">
                <Undo2 className="h-3 w-3" aria-hidden="true" />Undo
              </button>
            </div>
          )}
        </div>

        <div className="px-4 py-4">
          {!loading && !recommended && (
            <p className="text-xs leading-relaxed text-[#475569]">
              {closures.length === 0
                ? "All 70 flights are operating on schedule. Click any airport or drag a storm cell to test recovery plans."
                : "No valid spare swap, round-trip cancellation, or <=45m hold improves stranded passengers or delay further."}
            </p>
          )}

          {recommended && baseline && (
            <div className="rounded-xl border border-[#E6EBF2] bg-[#FBFCFD] p-3.5">
              <div className="flex items-center justify-between">
                <span className="rounded-sm bg-[#EFF6FF] px-2 py-0.5 font-mono text-[10px] font-bold text-[#1D4ED8]">#1 Best Fix</span>
                <span className="font-mono text-[10px] text-[#475569]">{recommended.category}</span>
              </div>
              <h3 className="mt-2 text-sm font-semibold leading-snug text-[#0F172A]">{formatHeroHeadline(recommended)}</h3>
              <p className="mt-1 font-mono text-[11px] leading-snug text-[#475569]">{recommended.title}</p>

              <div className="mt-3 flex flex-wrap gap-1.5 font-mono tabular-nums">
                {heroKpis.map((kpi) => (
                  <div key={kpi.label} className="rounded-md border border-[#E6EBF2] bg-[#FFFFFF] px-2 py-1">
                    <div className="font-sans text-[10px] text-[#475569]">{kpi.label}</div>
                    <div className={`text-xs font-bold ${kpi.positive ? "text-[#047857]" : "text-[#B45309]"}`}>{kpi.valueText}</div>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  aria-pressed={previewCandidateId === recommended.id}
                  onClick={() => onPreviewCandidate(previewCandidateId === recommended.id ? null : recommended)}
                  className={`flex h-8 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md border text-xs font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB] ${previewCandidateId === recommended.id ? "border-[#047857] bg-[#ECFDF5] text-[#047857]" : "border-[#CBD5E1] bg-[#FFFFFF] text-[#0F172A] hover:bg-[#F1F5F9]"}`}
                >
                  <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                  {previewCandidateId === recommended.id ? "Hide Preview" : "Preview"}
                </button>
                <button type="button" disabled={loading} onClick={() => onApplyCandidate(recommended)} className="flex h-8 flex-1 cursor-pointer items-center justify-center rounded-md bg-[#1D4ED8] px-3 text-xs font-semibold text-white transition-colors duration-150 hover:bg-[#1E40AF] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB]">
                  Apply Fix
                </button>
              </div>
            </div>
          )}
        </div>

        {alternatives.length > 0 && baseline && (
          <div className="px-4 py-3">
            <button type="button" aria-expanded={showAlternatives} onClick={() => setShowAlternatives((v) => !v)} className="flex w-full cursor-pointer items-center justify-between rounded-md py-1 text-xs font-semibold text-[#475569] hover:text-[#0F172A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB]">
              <span>More options ({alternatives.length})</span>
              {showAlternatives ? <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />}
            </button>
            {showAlternatives && (
              <div className="mt-2 divide-y divide-[#E6EBF2]">
                {alternatives.map((alt) => {
                  const isPreviewing = previewCandidateId === alt.id;
                  const altBadge = alt.deltas.strandedPaxDelta !== 0 ? `${alt.deltas.strandedPaxDelta}p` : alt.deltas.crewBreachesDelta !== 0 ? `${alt.deltas.crewBreachesDelta} breach` : `${alt.deltas.totalDelayMinutesDelta > 0 ? "+" : ""}${alt.deltas.totalDelayMinutesDelta}m`;
                  const altPositive = alt.deltas.strandedPaxDelta < 0 || alt.deltas.crewBreachesDelta < 0 || alt.deltas.totalDelayMinutesDelta <= 0;
                  return (
                    <div key={alt.id} className="space-y-2 py-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-medium text-[#0F172A]">{alt.title}</span>
                        <span className={`shrink-0 font-mono text-[11px] font-semibold tabular-nums ${altPositive ? "text-[#047857]" : "text-[#B45309]"}`}>{altBadge}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button type="button" aria-pressed={isPreviewing} onClick={() => onPreviewCandidate(isPreviewing ? null : alt)} className={`flex h-7 flex-1 cursor-pointer items-center justify-center gap-1 rounded-md border text-[11px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB] ${isPreviewing ? "border-[#047857] bg-[#ECFDF5] text-[#047857]" : "border-[#E6EBF2] bg-[#FBFCFD] text-[#0F172A] hover:bg-[#F1F5F9]"}`}>
                          <Eye className="h-3 w-3" aria-hidden="true" />{isPreviewing ? "Hide" : "Preview"}
                        </button>
                        <button type="button" disabled={loading} onClick={() => onApplyCandidate(alt)} className="flex h-7 flex-1 cursor-pointer items-center justify-center rounded-md border border-[#1D4ED8] bg-[#EFF6FF] text-[11px] font-semibold text-[#1D4ED8] hover:bg-[#DBEAFE] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB]">
                          Apply
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-[#E6EBF2] bg-[#FBFCFD] p-3">
        {activeQueryResult && qr && (
          <div aria-live="polite" className="mb-2.5 max-h-40 overflow-y-auto rounded-lg border border-[#E6EBF2] bg-[#FFFFFF] p-2.5 shadow-xs">
            <div className="flex items-start justify-between gap-2">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-wide text-[#1D4ED8]">{activeQueryResult.prompt}</span>
              <button type="button" onClick={() => setLastQueryEntry(null)} aria-label="Dismiss query answer" className="cursor-pointer rounded p-0.5 text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB]">
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-[#0F172A]">{qr.answer}</p>
            {(suggestedClosures || focusFlightId || focusAirportId) && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {suggestedClosures && onApplySuggestedClosures && (
                  <button type="button" onClick={() => onApplySuggestedClosures(suggestedClosures)} className="cursor-pointer rounded-md bg-[#1D4ED8] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#1E40AF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB]">{qr.actionLabel ?? "Run Live Crisis"}</button>
                )}
                {focusFlightId && onFocusFlight && (
                  <button type="button" onClick={() => onFocusFlight(focusFlightId)} className="cursor-pointer rounded-md border border-[#E6EBF2] bg-[#FBFCFD] px-2.5 py-1 font-mono text-[11px] font-semibold text-[#1D4ED8] hover:bg-[#EFF6FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB]">Inspect {focusFlightId}</button>
                )}
                {focusAirportId && onFocusAirport && (
                  <button type="button" onClick={() => onFocusAirport(focusAirportId)} className="cursor-pointer rounded-md border border-[#E6EBF2] bg-[#FBFCFD] px-2.5 py-1 font-mono text-[11px] font-medium text-[#475569] hover:text-[#0F172A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB]">Focus {focusAirportId}</button>
                )}
              </div>
            )}
          </div>
        )}

        <div className="mb-2 flex flex-wrap gap-1.5">
          <button type="button" disabled={!evaluation} onClick={() => executeQuery("What if +30m?")} className="cursor-pointer rounded-full border border-[#E6EBF2] bg-[#FFFFFF] px-2.5 py-0.5 text-[11px] font-medium text-[#475569] transition-colors duration-150 hover:border-[#2B79FB]/40 hover:text-[#1D4ED8] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB]">What if +30m?</button>
          <button type="button" disabled={!evaluation} onClick={() => executeQuery("Worst flight?")} className="cursor-pointer rounded-full border border-[#E6EBF2] bg-[#FFFFFF] px-2.5 py-0.5 text-[11px] font-medium text-[#475569] transition-colors duration-150 hover:border-[#2B79FB]/40 hover:text-[#1D4ED8] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB]">Worst flight?</button>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); executeQuery(queryText); }} className="flex items-center gap-1.5">
          <label htmlFor="dispatcher-whatif-input" className="sr-only">Ask AI Helper or test what-if scenario</label>
          <input id="dispatcher-whatif-input" type="text" value={queryText} onChange={(e) => setQueryText(e.target.value)} placeholder="Ask AI Helper (e.g. +30m, DS0304)..." className="h-8 flex-1 rounded-md border border-[#CBD5E1] bg-[#FFFFFF] px-2.5 text-xs text-[#0F172A] placeholder:text-[#475569] focus-visible:border-[#2B79FB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB]" />
          <button type="submit" disabled={!queryText.trim() || !evaluation} aria-label="Send query" className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md bg-[#1D4ED8] text-white transition-colors duration-150 hover:bg-[#1E40AF] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB]">
            <Send className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </form>
      </div>
    </aside>
  );
});
