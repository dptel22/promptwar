"use client";

import {
  ArrowRight,
  CheckCircle2,
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
  if (!isOpen) return null;

  const candidates = evaluation?.candidates ?? [];
  const baseline = evaluation?.baseline;
  const noteByCandidateId = new Map(
    (briefing?.optionNotes ?? []).map((n) => [n.candidateId, n])
  );

  return (
    <aside
      aria-label="AI Recovery Dispatcher"
      className="flex h-full w-full shrink-0 flex-col border-l border-[#222C38] bg-[#11161D] sm:w-[380px]"
    >
      {/* Header */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-[#222C38] px-3.5">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-sm font-bold text-[#F1F5F9]">
            AI Dispatcher
          </h2>
          {mode === "ai_verified" ? (
            <span className="inline-flex items-center gap-1 rounded-sm border border-emerald-500/40 bg-emerald-950/50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#34D399]">
              <ShieldCheck className="h-3 w-3" aria-hidden="true" />
              AI VERIFIED
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-sm border border-amber-500/40 bg-amber-950/40 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#FBBF24]">
              <Cpu className="h-3 w-3" aria-hidden="true" />
              ENGINE MODE
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            aria-label="Re-evaluate recovery plans"
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-[#222C38] bg-[#18202A] text-[#94A3B8] transition-colors duration-150 hover:text-[#F1F5F9] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close AI Dispatcher drawer"
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-[#222C38] bg-[#18202A] text-[#94A3B8] transition-colors duration-150 hover:text-[#F1F5F9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 space-y-3 overflow-y-auto p-3.5">
        {/* Applied Recovery Actions Strip */}
        {activeActions.length > 0 && (
          <div className="rounded-md border border-emerald-500/40 bg-emerald-950/30 p-2.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-mono text-[11px] font-semibold text-[#34D399]">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                RECOVERY APPLIED ({activeActions.length})
              </span>
              <button
                type="button"
                onClick={onUndoRecovery}
                className="flex cursor-pointer items-center gap-1 rounded-sm border border-[#222C38] bg-[#18202A] px-2 py-0.5 text-[11px] font-medium text-[#F1F5F9] hover:bg-[#1F2937] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
              >
                <Undo2 className="h-3 w-3" aria-hidden="true" />
                Undo
              </button>
            </div>
            <ul className="mt-1.5 space-y-1 text-xs text-[#F1F5F9]">
              {activeActions.map((act) => (
                <li key={act.id} className="font-mono text-[11px]">
                  • {act.label}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Grounded Situation Briefing */}
        {briefing && (
          <div className="rounded-md border border-[#222C38] bg-[#090D12] p-3">
            <div className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">
              Deterministic Situation Brief
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-[#F1F5F9]">
              {briefing.executiveSummary}
            </p>
            {briefing.tradeoffAnalysis && (
              <p className="mt-1.5 border-t border-[#222C38] pt-1.5 text-xs leading-relaxed text-[#94A3B8]">
                {briefing.tradeoffAnalysis}
              </p>
            )}
          </div>
        )}

        {/* Candidate Recovery Plans */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">
              Verified Recovery Options ({candidates.length})
            </h3>
            {loading && (
              <span className="font-mono text-[10px] text-[#FBBF24]">
                EVALUATING...
              </span>
            )}
          </div>

          {!loading && candidates.length === 0 && (
            <div className="rounded-md border border-[#222C38] bg-[#18202A] p-3 text-xs text-[#94A3B8]">
              {evaluation && evaluation.closures.length === 0
                ? "Network nominal under Clear Skies. Close any airport or drag the Storm Cell to test recovery countermeasures."
                : "No valid spare swap, round-trip cancellation, or <=45m hold improves stranded passengers for this window."}
            </div>
          )}

          {candidates.map((candidate, index) => {
            const isTop =
              candidate.id === briefing?.recommendedCandidateId || index === 0;
            const isPreviewing = previewCandidateId === candidate.id;
            const note = noteByCandidateId.get(candidate.id);
            const bm = baseline!.metrics;
            const am = candidate.result.metrics;

            return (
              <div
                key={candidate.id}
                className={`rounded-lg border p-3 transition-colors duration-150 ${
                  isPreviewing
                    ? "border-emerald-500 bg-[#18202A]"
                    : isTop
                      ? "border-amber-500/70 bg-[#18202A]"
                      : "border-[#222C38] bg-[#141B23]"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`rounded-sm px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                        isTop
                          ? "bg-[#F59E0B] text-[#090D12]"
                          : "border border-[#222C38] bg-[#090D12] text-[#94A3B8]"
                      }`}
                    >
                      {isTop ? "BEST RECOVERY" : `OPTION ${index + 1}`}
                    </span>
                    <span className="rounded-sm border border-[#222C38] bg-[#090D12] px-1.5 py-0.5 font-mono text-[10px] text-[#94A3B8]">
                      {candidate.category}
                    </span>
                  </div>
                </div>

                <h4 className="mt-2 text-xs font-semibold leading-snug text-[#F1F5F9]">
                  {candidate.title}
                </h4>

                {/* Verified Before -> After Numeric Strip */}
                <div className="mt-2 grid grid-cols-3 gap-1.5 rounded-md border border-[#222C38] bg-[#090D12] p-2 font-mono text-[11px] tabular-nums">
                  <div>
                    <div className="text-[9px] uppercase text-[#94A3B8]">
                      Stranded
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[#94A3B8]">
                        {bm.totalStrandedPax}
                      </span>
                      <ArrowRight className="h-2.5 w-2.5 text-[#94A3B8]" aria-hidden="true" />
                      <span
                        className={
                          candidate.deltas.strandedPaxDelta < 0
                            ? "font-bold text-[#34D399]"
                            : "text-[#F1F5F9]"
                        }
                      >
                        {am.totalStrandedPax}
                      </span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase text-[#94A3B8]">
                      Crew Breach
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[#94A3B8]">{bm.crewBreaches}</span>
                      <ArrowRight className="h-2.5 w-2.5 text-[#94A3B8]" aria-hidden="true" />
                      <span
                        className={
                          am.crewBreaches < bm.crewBreaches
                            ? "font-bold text-[#34D399]"
                            : "text-[#F1F5F9]"
                        }
                      >
                        {am.crewBreaches}
                      </span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase text-[#94A3B8]">
                      Net Delay
                    </div>
                    <div
                      className={
                        candidate.deltas.totalDelayMinutesDelta <= 0
                          ? "font-bold text-[#34D399]"
                          : "text-[#FBBF24]"
                      }
                    >
                      {candidate.deltas.totalDelayMinutesDelta > 0 ? "+" : ""}
                      {candidate.deltas.totalDelayMinutesDelta}m
                    </div>
                  </div>
                </div>

                {note && (
                  <div className="mt-2 space-y-1 text-[11px] leading-relaxed">
                    <p className="text-[#F1F5F9]">{note.rationale}</p>
                    <p className="text-[#94A3B8]">{note.tradeoff}</p>
                  </div>
                )}

                <div className="mt-2.5 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      onPreviewCandidate(isPreviewing ? null : candidate)
                    }
                    className={`flex h-7 flex-1 cursor-pointer items-center justify-center gap-1 rounded-md border text-[11px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                      isPreviewing
                        ? "border-emerald-500 bg-emerald-950/60 text-[#34D399]"
                        : "border-[#222C38] bg-[#11161D] text-[#F1F5F9] hover:border-slate-500 hover:bg-[#1F2937]"
                    }`}
                  >
                    <Eye className="h-3 w-3" aria-hidden="true" />
                    {isPreviewing ? "Hide Ghost" : "Preview"}
                  </button>

                  <button
                    type="button"
                    onClick={() => onApplyCandidate(candidate)}
                    className="flex h-7 flex-1 cursor-pointer items-center justify-center rounded-md bg-[#F59E0B] px-2 text-[11px] font-semibold text-[#090D12] transition-colors duration-150 hover:bg-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                  >
                    Apply Recovery
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
