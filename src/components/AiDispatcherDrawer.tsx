"use client";

import { useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cpu,
  Eye,
  RefreshCw,
  Send,
  ShieldCheck,
  Undo2,
  X,
} from "lucide-react";
import {
  type DispatcherQueryResponse,
  answerDispatcherQuery,
} from "@/lib/sim/recovery";
import type {
  AirportClosure,
  DispatcherBriefing,
  RecoveryAction,
  RecoveryCandidate,
  RecoveryEvaluation,
} from "@/lib/sim/types";

interface AiDispatcherDrawerProps {
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

export function AiDispatcherDrawer({
  isOpen,
  viewMode,
  loading,
  mode,
  evaluation,
  briefing,
  activeActions,
  previewCandidateId,
  onPreviewCandidate,
  onApplyCandidate,
  onUndoRecovery,
  onRefresh,
  onClose,
  onApplySuggestedClosures,
  onFocusFlight,
  onFocusAirport,
}: AiDispatcherDrawerProps) {
  const [expandedAltId, setExpandedAltId] = useState<string | null>(null);
  const [queryText, setQueryText] = useState("");
  const [lastQueryEntry, setLastQueryEntry] = useState<{
    contextKey: string;
    prompt: string;
    response: DispatcherQueryResponse;
  } | null>(null);

  if (!isOpen) return null;

  const candidates = evaluation?.candidates ?? [];
  const baseline = evaluation?.baseline;
  const closures = evaluation?.closures ?? [];
  const contextKey = `${closures
    .map((c) => `${c.airportId}:${c.startMin}-${c.endMin}`)
    .join("|")}::${activeActions.map((a) => a.id).join(",")}`;

  const activeQueryResult =
    lastQueryEntry && lastQueryEntry.contextKey === contextKey
      ? lastQueryEntry
      : null;

  const noteByCandidateId = new Map(
    (briefing?.optionNotes ?? []).map((n) => [n.candidateId, n])
  );

  const recommended =
    candidates.find((c) => c.id === briefing?.recommendedCandidateId) ??
    candidates[0];
  const alternatives = candidates.filter((c) => c.id !== recommended?.id);

  function executeQuery(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed || !evaluation) return;
    const response = answerDispatcherQuery(
      trimmed,
      evaluation.baseline,
      evaluation.closures,
      activeActions
    );
    setLastQueryEntry({ contextKey, prompt: trimmed, response });
    setQueryText("");
  }

  // Adaptive delta KPIs for featured recommendation (never 0 -> 0 for both pax & breaches)
  const featuredKpis: Array<{
    label: string;
    before?: number;
    after?: number;
    deltaText?: string;
    positive: boolean;
  }> = [];
  if (recommended && baseline) {
    const hasPax =
      baseline.metrics.totalStrandedPax > 0 ||
      recommended.result.metrics.totalStrandedPax > 0;
    const hasBreaches =
      baseline.metrics.crewBreaches > 0 ||
      recommended.result.metrics.crewBreaches > 0;

    if (hasPax) {
      featuredKpis.push({
        label: "Stranded pax",
        before: baseline.metrics.totalStrandedPax,
        after: recommended.result.metrics.totalStrandedPax,
        positive: recommended.deltas.strandedPaxDelta <= 0,
      });
    }
    if (hasBreaches) {
      featuredKpis.push({
        label: "Crew breaches",
        before: baseline.metrics.crewBreaches,
        after: recommended.result.metrics.crewBreaches,
        positive: recommended.deltas.crewBreachesDelta <= 0,
      });
    }
    featuredKpis.push({
      label: "Delayed",
      before: baseline.metrics.delayedFlights,
      after: recommended.result.metrics.delayedFlights,
      positive: recommended.deltas.delayedFlightsDelta <= 0,
    });
    featuredKpis.push({
      label: "Net delay",
      deltaText: `${recommended.deltas.totalDelayMinutesDelta > 0 ? "+" : ""}${
        recommended.deltas.totalDelayMinutesDelta
      }m`,
      positive: recommended.deltas.totalDelayMinutesDelta <= 0,
    });
    if (!hasPax && !hasBreaches) {
      featuredKpis.push({
        label: "On time",
        before: baseline.metrics.onTimeFlights,
        after: recommended.result.metrics.onTimeFlights,
        positive:
          recommended.result.metrics.onTimeFlights >=
          baseline.metrics.onTimeFlights,
      });
    }
  }

  return (
    <aside
      aria-label="AI Recovery Dispatcher"
      className="flex h-full w-full shrink-0 flex-col border-l border-[#E6EBF2] bg-[#FFFFFF] sm:w-[356px]"
    >
      {/* Header */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-[#E6EBF2] px-4">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-sm font-bold text-[#0F172A]">
            AI Dispatcher
          </h2>
          {mode === "ai_verified" ? (
            <span className="inline-flex items-center gap-1 rounded-sm border border-[#047857]/30 bg-[#ECFDF5] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#047857]">
              <ShieldCheck className="h-3 w-3" aria-hidden="true" />
              Verified AI
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-sm border border-[#2B79FB]/30 bg-[#EFF6FF] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#1D4ED8]">
              <Cpu className="h-3 w-3" aria-hidden="true" />
              Engine
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            aria-label="Re-evaluate recovery plans"
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB]"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close AI Dispatcher"
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB]"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 divide-y divide-[#E6EBF2] overflow-y-auto">
        {/* Interactive Dispatch Ask / What-If Console */}
        <div className="bg-[#FBFCFD] px-4 py-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              executeQuery(queryText);
            }}
            className="flex items-center gap-1.5"
          >
            <label htmlFor="dispatcher-whatif-input" className="sr-only">
              Ask AI Dispatcher or test what-if scenario
            </label>
            <input
              id="dispatcher-whatif-input"
              type="text"
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              placeholder="Ask AI Dispatcher or test what-if (e.g. +30m)..."
              className="h-8 flex-1 rounded-md border border-[#CBD5E1] bg-[#FFFFFF] px-2.5 text-xs text-[#0F172A] placeholder:text-[#475569] focus-visible:border-[#2B79FB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB]"
            />
            <button
              type="submit"
              disabled={!queryText.trim() || !evaluation}
              aria-label="Run dispatcher query"
              className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md bg-[#1D4ED8] text-white transition-colors duration-150 hover:bg-[#1E40AF] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB]"
            >
              <Send className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </form>

          {closures.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => executeQuery("+30m extension")}
                className="cursor-pointer rounded-full border border-[#E6EBF2] bg-[#FFFFFF] px-2.5 py-0.5 text-[11px] font-medium text-[#475569] transition-colors duration-150 hover:border-[#2B79FB]/40 hover:text-[#1D4ED8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB]"
              >
                +30m extension cliff?
              </button>
              <button
                type="button"
                onClick={() => executeQuery("Trace worst domino chain")}
                className="cursor-pointer rounded-full border border-[#E6EBF2] bg-[#FFFFFF] px-2.5 py-0.5 text-[11px] font-medium text-[#475569] transition-colors duration-150 hover:border-[#2B79FB]/40 hover:text-[#1D4ED8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB]"
              >
                Trace worst chain
              </button>
            </div>
          )}

          {activeQueryResult && (
            <div className="mt-2.5 rounded-lg border border-[#E6EBF2] bg-[#FFFFFF] p-2.5 shadow-xs">
              <div className="flex items-start justify-between gap-2">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-wide text-[#1D4ED8]">
                  Query · {activeQueryResult.prompt}
                </span>
                <button
                  type="button"
                  onClick={() => setLastQueryEntry(null)}
                  aria-label="Dismiss query answer"
                  className="cursor-pointer rounded p-0.5 text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB]"
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-[#0F172A]">
                {activeQueryResult.response.answer}
              </p>

              {(activeQueryResult.response.suggestedClosures ||
                activeQueryResult.response.focusFlightId ||
                activeQueryResult.response.focusAirportId) && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {activeQueryResult.response.suggestedClosures &&
                    onApplySuggestedClosures && (
                      <button
                        type="button"
                        onClick={() =>
                          onApplySuggestedClosures(
                            activeQueryResult.response.suggestedClosures!
                          )
                        }
                        className="cursor-pointer rounded-md bg-[#1D4ED8] px-2.5 py-1 text-[11px] font-semibold text-white transition-colors duration-150 hover:bg-[#1E40AF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB]"
                      >
                        {activeQueryResult.response.actionLabel ?? "Run Live Crisis"}
                      </button>
                    )}
                  {activeQueryResult.response.focusFlightId && onFocusFlight && (
                    <button
                      type="button"
                      onClick={() =>
                        onFocusFlight(activeQueryResult.response.focusFlightId!)
                      }
                      className="cursor-pointer rounded-md border border-[#E6EBF2] bg-[#FBFCFD] px-2.5 py-1 font-mono text-[11px] font-semibold text-[#1D4ED8] hover:bg-[#EFF6FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB]"
                    >
                      Inspect {activeQueryResult.response.focusFlightId}
                    </button>
                  )}
                  {activeQueryResult.response.focusAirportId &&
                    onFocusAirport && (
                      <button
                        type="button"
                        onClick={() =>
                          onFocusAirport(activeQueryResult.response.focusAirportId!)
                        }
                        className="cursor-pointer rounded-md border border-[#E6EBF2] bg-[#FBFCFD] px-2.5 py-1 font-mono text-[11px] font-medium text-[#475569] hover:text-[#0F172A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB]"
                      >
                        Focus {activeQueryResult.response.focusAirportId}
                      </button>
                    )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Applied Recovery Strip */}
        {activeActions.length > 0 && (
          <div className="bg-[#ECFDF5]/60 px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#047857]">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                {activeActions.length} recovery applied
              </span>
              <button
                type="button"
                onClick={onUndoRecovery}
                className="flex cursor-pointer items-center gap-1 rounded-md border border-[#CBD5E1] bg-[#FFFFFF] px-2 py-0.5 text-xs font-medium text-[#0F172A] hover:bg-[#F1F5F9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB]"
              >
                <Undo2 className="h-3 w-3" aria-hidden="true" />
                Undo
              </button>
            </div>
            <ul className="mt-1.5 space-y-1 text-xs text-[#0F172A]">
              {activeActions.map((act) => (
                <li key={act.id} className="font-mono text-[11px]">
                  • {act.label}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Flight Situation Summary */}
        {briefing && (
          <div className="px-4 py-3.5">
            <div className="text-xs font-semibold text-[#0F172A]">
              Network briefing
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-[#475569]">
              {briefing.executiveSummary}
            </p>
            {briefing.tradeoffAnalysis && (
              <p className="mt-1.5 text-xs leading-relaxed text-[#0F172A]">
                {briefing.tradeoffAnalysis}
              </p>
            )}
          </div>
        )}

        {/* #1 Featured Recommendation */}
        <div className="px-4 py-4">
          {!loading && !recommended && (
            <p className="text-xs text-[#475569]">
              {evaluation && evaluation.closures.length === 0
                ? "All 70 flights are operating on schedule. Click any airport or drag a storm cell to test recovery plans."
                : "No valid spare swap, round-trip cancellation, or <=45m hold improves stranded passengers or delay further."}
            </p>
          )}

          {recommended && baseline && (
            <div>
              <div className="flex items-center justify-between">
                <span className="rounded-sm bg-[#EFF6FF] px-2 py-0.5 font-mono text-[10px] font-bold text-[#1D4ED8]">
                  Recommended action
                </span>
                <span className="font-mono text-[10px] text-[#475569]">
                  {recommended.category}
                </span>
              </div>

              <h3 className="mt-2 text-sm font-semibold leading-snug text-[#0F172A]">
                {recommended.title}
              </h3>

              {/* Adaptive Tabular Delta Strip */}
              <div
                className={`mt-3 grid gap-2 border-y border-[#E6EBF2] py-2.5 font-mono text-xs tabular-nums ${
                  featuredKpis.length === 4 ? "grid-cols-2" : "grid-cols-3"
                }`}
              >
                {featuredKpis.map((kpi) => (
                  <div key={kpi.label}>
                    <div className="font-sans text-[11px] text-[#475569]">
                      {kpi.label}
                    </div>
                    {kpi.deltaText !== undefined ? (
                      <div
                        className={`mt-0.5 font-bold ${
                          kpi.positive ? "text-[#047857]" : "text-[#B45309]"
                        }`}
                      >
                        {kpi.deltaText}
                      </div>
                    ) : (
                      <div className="mt-0.5 flex items-center gap-1 font-bold">
                        <span className="text-[#475569]">{kpi.before}</span>
                        <ArrowRight
                          className="h-3 w-3 text-[#475569]"
                          aria-hidden="true"
                        />
                        <span
                          className={
                            kpi.positive ? "text-[#047857]" : "text-[#B45309]"
                          }
                        >
                          {kpi.after}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {noteByCandidateId.get(recommended.id) && (
                <p className="mt-2.5 text-xs leading-relaxed text-[#475569]">
                  {noteByCandidateId.get(recommended.id)!.tradeoff}
                </p>
              )}

              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  aria-pressed={previewCandidateId === recommended.id}
                  onClick={() =>
                    onPreviewCandidate(
                      previewCandidateId === recommended.id ? null : recommended
                    )
                  }
                  className={`flex h-8 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md border text-xs font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB] ${
                    previewCandidateId === recommended.id
                      ? "border-[#047857] bg-[#ECFDF5] text-[#047857]"
                      : "border-[#CBD5E1] bg-[#FFFFFF] text-[#0F172A] hover:bg-[#F1F5F9]"
                  }`}
                >
                  <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                  {previewCandidateId === recommended.id
                    ? "Hide Preview"
                    : "Preview"}
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => onApplyCandidate(recommended)}
                  className="flex h-8 flex-1 cursor-pointer items-center justify-center rounded-md bg-[#1D4ED8] px-3 text-xs font-semibold text-white transition-colors duration-150 hover:bg-[#1E40AF] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB]"
                >
                  Apply Recovery
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Compact Collapsible Alternatives */}
        {alternatives.length > 0 && baseline && (
          <div className="px-4 py-3">
            <div className="mb-2 text-xs font-semibold text-[#475569]">
              Alternative options ({alternatives.length})
            </div>
            <div className="divide-y divide-[#E6EBF2]">
              {alternatives.map((alt) => {
                const isExpanded =
                  viewMode === "advanced" || expandedAltId === alt.id;
                const isPreviewing = previewCandidateId === alt.id;
                const note = noteByCandidateId.get(alt.id);
                const altBadge =
                  alt.deltas.strandedPaxDelta !== 0
                    ? `${alt.deltas.strandedPaxDelta}p`
                    : alt.deltas.crewBreachesDelta !== 0
                      ? `${alt.deltas.crewBreachesDelta} breach`
                      : `${alt.deltas.totalDelayMinutesDelta > 0 ? "+" : ""}${
                          alt.deltas.totalDelayMinutesDelta
                        }m`;
                const altPositive =
                  alt.deltas.strandedPaxDelta < 0 ||
                  alt.deltas.crewBreachesDelta < 0 ||
                  (alt.deltas.strandedPaxDelta === 0 &&
                    alt.deltas.crewBreachesDelta === 0 &&
                    alt.deltas.totalDelayMinutesDelta <= 0);

                return (
                  <div key={alt.id} className="py-2.5">
                    <button
                      type="button"
                      aria-expanded={isExpanded}
                      onClick={() =>
                        setExpandedAltId(isExpanded ? null : alt.id)
                      }
                      className="flex w-full cursor-pointer items-start justify-between gap-2 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB]"
                    >
                      <span className="text-xs font-medium text-[#0F172A]">
                        {alt.title}
                      </span>
                      <div
                        className={`flex shrink-0 items-center gap-1.5 font-mono text-[11px] font-semibold tabular-nums ${
                          altPositive ? "text-[#047857]" : "text-[#B45309]"
                        }`}
                      >
                        <span>{altBadge}</span>
                        {viewMode === "simple" &&
                          (isExpanded ? (
                            <ChevronUp
                              className="h-3.5 w-3.5 text-[#475569]"
                              aria-hidden="true"
                            />
                          ) : (
                            <ChevronDown
                              className="h-3.5 w-3.5 text-[#475569]"
                              aria-hidden="true"
                            />
                          ))}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="mt-2 space-y-2">
                        <div className="flex items-center gap-3 font-mono text-[11px] tabular-nums text-[#475569]">
                          <span>
                            Delayed: {baseline.metrics.delayedFlights}→
                            {alt.result.metrics.delayedFlights}
                          </span>
                          <span>
                            Delay:{" "}
                            {alt.deltas.totalDelayMinutesDelta > 0 ? "+" : ""}
                            {alt.deltas.totalDelayMinutesDelta}m
                          </span>
                        </div>
                        {note && (
                          <p className="text-[11px] leading-relaxed text-[#475569]">
                            {note.tradeoff}
                          </p>
                        )}
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            aria-pressed={isPreviewing}
                            onClick={() =>
                              onPreviewCandidate(isPreviewing ? null : alt)
                            }
                            className={`flex h-7 flex-1 cursor-pointer items-center justify-center gap-1 rounded-md border text-[11px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB] ${
                              isPreviewing
                                ? "border-[#047857] bg-[#ECFDF5] text-[#047857]"
                                : "border-[#E6EBF2] bg-[#FBFCFD] text-[#0F172A] hover:bg-[#F1F5F9]"
                            }`}
                          >
                            <Eye className="h-3 w-3" aria-hidden="true" />
                            {isPreviewing ? "Hide" : "Preview"}
                          </button>
                          <button
                            type="button"
                            disabled={loading}
                            onClick={() => onApplyCandidate(alt)}
                            className="flex h-7 flex-1 cursor-pointer items-center justify-center rounded-md border border-[#1D4ED8] bg-[#EFF6FF] text-[11px] font-semibold text-[#1D4ED8] hover:bg-[#DBEAFE] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B79FB]"
                          >
                            Apply
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
