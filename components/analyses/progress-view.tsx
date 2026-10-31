"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useAnalysisProgress } from "@/hooks/use-analysis-progress";
import {
  isUnfinished,
  sameProgress,
  stageLabel,
  STAGES,
  type Progress,
} from "@/lib/pipeline/stages";

import { RerunButton } from "./rerun-button";

type Step = "done" | "current" | "failed" | "stale" | "pending";

const MARKS: Record<Step, string> = {
  done: "✓",
  current: "›",
  failed: "×",
  stale: "!",
  pending: "·",
};

const MARK_STYLES: Record<Step, string> = {
  done: "text-muted-foreground",
  current: "text-foreground",
  failed: "text-destructive",
  stale: "text-muted-foreground",
  pending: "text-border",
};

const LABEL_STYLES: Record<Step, string> = {
  done: "text-muted-foreground",
  current: "text-foreground",
  failed: "text-destructive",
  stale: "text-foreground",
  pending: "text-muted-foreground/60",
};

function stepAt(
  index: number,
  progress: Progress,
  stale: boolean,
): Step {
  if (progress.status === "succeeded") {
    return "done";
  }

  const current = STAGES.findIndex(
    (entry) => entry.stage === progress.stage,
  );

  if (progress.status === "queued" || current === -1 || index > current) {
    return "pending";
  }
  if (index < current) {
    return "done";
  }
  if (progress.status === "failed") {
    return "failed";
  }
  return stale ? "stale" : "current";
}

export function ProgressView({
  analysisId,
  initial,
  staleAtRender,
}: {
  analysisId: string;
  initial: Progress;
  staleAtRender: boolean;
}) {
  const [restarting, setRestarting] = useState(false);
  const rerunFailed = useCallback(() => setRestarting(false), []);
  const { progress, lost } = useAnalysisProgress(
    analysisId,
    initial,
    !restarting,
  );
  const stale =
    staleAtRender &&
    isUnfinished(progress.status) &&
    sameProgress(progress, initial);

  // The finished page is the server's to render. A full load rather than a
  // Flight refresh: a live channel update during that stream corrupts the
  // client in Next 16.
  const finished = !isUnfinished(progress.status);
  const wasFinished = useRef(finished);
  useEffect(() => {
    if (finished && !wasFinished.current) {
      window.location.reload();
    }
    wasFinished.current = finished;
  }, [finished]);

  // How far down the fixed stage list the run has got. A failed run stops at
  // the stage it failed on rather than claiming that stage finished.
  const currentIndex = STAGES.findIndex(
    (entry) => entry.stage === progress.stage,
  );
  const reached =
    progress.status === "succeeded"
      ? STAGES.length
      : currentIndex < 0
        ? 0
        : progress.status === "failed"
          ? currentIndex
          : currentIndex + 1;
  const percent = Math.round((reached / STAGES.length) * 100);

  return (
    <section className="mt-6 max-w-xl">
      <h2 className="text-[13px] font-medium">Mapping this repository</h2>
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        The map appears when every stage is done. Each stage moves as the run
        reaches it.
      </p>

      <div
        role="progressbar"
        aria-label="Mapping stages complete"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="mt-5 h-px w-full overflow-hidden bg-border"
      >
        <div
          className="h-full bg-foreground transition-[width] duration-700 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>

      <ol className="mt-3 border-t border-border">
        {STAGES.map((entry, index) => {
          const step = stepAt(index, progress, stale);
          const detail =
            step === "current" || step === "failed" || step === "stale"
              ? progress.message
              : null;

          return (
            <li
              key={entry.stage}
              className="grid grid-cols-[1rem_7.5rem_minmax(0,1fr)] items-baseline gap-x-3 border-b border-border/60 py-1.5"
            >
              <span
                aria-hidden
                title={step}
                className={`inline-block font-mono text-[12px] ${MARK_STYLES[step]} ${step === "current" ? "atlas-live" : ""}`}
              >
                {MARKS[step]}
              </span>
              <span
                className={`font-mono text-[11px] ${LABEL_STYLES[step]}`}
              >
                {entry.label}
              </span>
              <span className="min-w-0 text-[11px] break-words text-muted-foreground">
                {detail}
              </span>
            </li>
          );
        })}
      </ol>

      {progress.stage === null && progress.message ? (
        <p className="mt-3 font-mono text-[10.5px] text-muted-foreground">
          {progress.message}
        </p>
      ) : null}

      {progress.status === "failed" ? (
        <div className="mt-4 border border-destructive/30 bg-destructive/5 px-3 py-2">
          <p className="text-[11px] font-medium text-destructive">
            Failed at {stageLabel(progress.stage)}
          </p>
          <p className="mt-1 font-mono text-[10.5px] whitespace-pre-wrap text-destructive">
            {progress.message ?? "No reason was recorded."}
          </p>
          <div className="mt-2">
            <RerunButton
              analysisId={analysisId}
              onStart={() => setRestarting(true)}
              onError={rerunFailed}
            />
          </div>
        </div>
      ) : null}

      {stale && progress.status !== "failed" ? (
        <div className="mt-4 border border-dashed border-border bg-muted/30 px-3 py-2">
          <p className="text-[11px]">
            This run stopped reporting over 5 minutes ago, so it was abandoned
            rather than still working.
          </p>
          <div className="mt-2">
            <RerunButton
              analysisId={analysisId}
              onStart={() => setRestarting(true)}
              onError={rerunFailed}
            />
          </div>
        </div>
      ) : null}

      {lost ? (
        <p className="mt-4 font-mono text-[10.5px] text-muted-foreground">
          Live updates stopped ({lost}). Reload the page to read the run&apos;s
          current state.
        </p>
      ) : null}
    </section>
  );
}
