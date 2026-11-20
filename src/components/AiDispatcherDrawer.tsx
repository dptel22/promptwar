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
  ShieldCheck,
  Undo2,
  X,
} from "lucide-react";
import type {
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
}: AiDispatcherDrawerProps) {
  const [expandedAltId, setExpandedAltId] = useState<string | null>(null);

  if (!isOpen) return null;

  const candidates = evaluation?.candidates ?? [];
  const baseline = evaluation?.baseline;
  const noteByCandidateId = new Map(
    (briefing?.optionNotes ?? []).map((n) => [n.candidateId, n])
  );

  const recommended =
    candidates.find((c) => c.id === briefing?.recommendedCandidateId) ??
    candidates[0];
  const alternatives = candidates.filter((c) => c.id !== recommended?.id);

  return (
    <aside
      aria-label="AI Recovery Dispatcher"
      className="flex h-full w-full shrink-0 flex-col border-l border-[#E2E8F0] bg-[#FFFFFF] sm:w-[340px]"
    >
      {/* Header */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-[#E2E8F0] px-4">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-sm font-bold text-[#0F172A]">
            AI Dispatcher
          </h2>
          {mode === "ai_verified" ? (
            <span className="inline-flex items-center gap-1 rounded-sm border border-[#059669]/30 bg-[#ECFDF5] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#059669]">
              <ShieldCheck className="h-3 w-3" aria-hidden="true" />
              Verified AI
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-sm border border-[#2563EB]/30 bg-[#EFF6FF] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#2563EB]">
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
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A] disabled:opacity-50"
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
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A]"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Clean Editorial Body (No Box Soup) */}
      <div className="flex-1 divide-y divide-[#E2E8F0] overflow-y-auto">
        {/* Applied Recovery Strip */}
        {activeActions.length > 0 && (
          <div className="bg-[#ECFDF5]/60 px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#059669]">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                {activeActions.length} recovery applied
              </span>
              <button
                type="button"
                onClick={onUndoRecovery}
                className="flex cursor-pointer items-center gap-1 rounded-md border border-[#CBD5E1] bg-[#FFFFFF] px-2 py-0.5 text-xs font-medium text-[#0F172A] hover:bg-[#F1F5F9]"
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
                : "No valid spare swap, round-trip cancellation, or <=45m hold improves stranded passengers further."}
            </p>
          )}

          {recommended && baseline && (
            <div>
              <div className="flex items-center justify-between">
                <span className="rounded-sm bg-[#EFF6FF] px-2 py-0.5 font-mono text-[10px] font-bold text-[#2563EB]">
                  Recommended action
                </span>
                <span className="font-mono text-[10px] text-[#475569]">
                  {recommended.category}
                </span>
              </div>

              <h3 className="mt-2 text-sm font-semibold leading-snug text-[#0F172A]">
                {recommended.title}
              </h3>

              {/* Clean Tabular Delta Row */}
              <div className="mt-3 grid grid-cols-3 gap-2 border-y border-[#E2E8F0] py-2.5 font-mono text-xs tabular-nums">
                <div>
                  <div className="font-sans text-[11px] text-[#475569]">
                    Stranded pax
                  </div>
                  <div className="mt-0.5 flex items-center gap-1 font-bold">
                    <span className="text-[#94A3B8]">
                      {baseline.metrics.totalStrandedPax}
                    </span>
                    <ArrowRight className="h-3 w-3 text-[#94A3B8]" aria-hidden="true" />
                    <span className="text-[#059669]">
                      {recommended.result.metrics.totalStrandedPax}
                    </span>
                  </div>
                </div>
                <div>
                  <div className="font-sans text-[11px] text-[#475569]">
                    Breaches
                  </div>
                  <div className="mt-0.5 flex items-center gap-1 font-bold">
                    <span className="text-[#94A3B8]">
                      {baseline.metrics.crewBreaches}
                    </span>
                    <ArrowRight className="h-3 w-3 text-[#94A3B8]" aria-hidden="true" />
                    <span className="text-[#059669]">
                      {recommended.result.metrics.crewBreaches}
                    </span>
                  </div>
                </div>
                <div>
                  <div className="font-sans text-[11px] text-[#475569]">
                    Net delay
                  </div>
                  <div
                    className={`mt-0.5 font-bold ${
                      recommended.deltas.totalDelayMinutesDelta <= 0
                        ? "text-[#059669]"
                        : "text-[#B45309]"
                    }`}
                  >
                    {recommended.deltas.totalDelayMinutesDelta > 0 ? "+" : ""}
                    {recommended.deltas.totalDelayMinutesDelta}m
                  </div>
                </div>
              </div>

              {noteByCandidateId.get(recommended.id) && (
                <p className="mt-2.5 text-xs leading-relaxed text-[#475569]">
                  {noteByCandidateId.get(recommended.id)!.tradeoff}
                </p>
              )}

              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    onPreviewCandidate(
                      previewCandidateId === recommended.id ? null : recommended
                    )
                  }
                  className={`flex h-8 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md border text-xs font-semibold transition-colors duration-150 ${
                    previewCandidateId === recommended.id
                      ? "border-[#059669] bg-[#ECFDF5] text-[#059669]"
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
                  onClick={() => onApplyCandidate(recommended)}
                  className="flex h-8 flex-1 cursor-pointer items-center justify-center rounded-md bg-[#2563EB] px-3 text-xs font-semibold text-white transition-colors duration-150 hover:bg-[#1D4ED8]"
                >
                  Apply Recovery
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Compact Collapsible Alternatives (Clean Row List) */}
        {alternatives.length > 0 && baseline && (
          <div className="px-4 py-3">
            <div className="mb-2 text-xs font-semibold text-[#475569]">
              Alternative options ({alternatives.length})
            </div>
            <div className="divide-y divide-[#F1F5F9]">
              {alternatives.map((alt) => {
                const isExpanded =
                  viewMode === "advanced" || expandedAltId === alt.id;
                const isPreviewing = previewCandidateId === alt.id;
                const note = noteByCandidateId.get(alt.id);

                return (
                  <div key={alt.id} className="py-2.5">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedAltId(isExpanded ? null : alt.id)
                      }
                      className="flex w-full cursor-pointer items-start justify-between gap-2 text-left"
                    >
                      <span className="text-xs font-medium text-[#0F172A]">
                        {alt.title}
                      </span>
                      <div className="flex shrink-0 items-center gap-1.5 font-mono text-[11px] font-semibold tabular-nums text-[#059669]">
                        <span>
                          {alt.deltas.strandedPaxDelta}p
                        </span>
                        {viewMode === "simple" &&
                          (isExpanded ? (
                            <ChevronUp className="h-3.5 w-3.5 text-[#475569]" aria-hidden="true" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5 text-[#475569]" aria-hidden="true" />
                          ))}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="mt-2 space-y-2">
                        <div className="flex items-center gap-3 font-mono text-[11px] tabular-nums text-[#475569]">
                          <span>
                            Stranded: {baseline.metrics.totalStrandedPax}→
                            {alt.result.metrics.totalStrandedPax}
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
                            onClick={() =>
                              onPreviewCandidate(isPreviewing ? null : alt)
                            }
                            className={`flex h-7 flex-1 cursor-pointer items-center justify-center gap-1 rounded-md border text-[11px] font-semibold ${
                              isPreviewing
                                ? "border-[#059669] bg-[#ECFDF5] text-[#059669]"
                                : "border-[#E2E8F0] bg-[#F8FAFC] text-[#0F172A] hover:bg-[#F1F5F9]"
                            }`}
                          >
                            <Eye className="h-3 w-3" aria-hidden="true" />
                            {isPreviewing ? "Hide" : "Preview"}
                          </button>
                          <button
                            type="button"
                            onClick={() => onApplyCandidate(alt)}
                            className="flex h-7 flex-1 cursor-pointer items-center justify-center rounded-md border border-[#2563EB] bg-[#EFF6FF] text-[11px] font-semibold text-[#2563EB] hover:bg-[#DBEAFE]"
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
