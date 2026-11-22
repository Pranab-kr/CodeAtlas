"use client";

import { AlertTriangle, Check, Circle, Loader2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useAnalysisProgress } from "@/hooks/use-analysis-progress";
import {
  isUnfinished,
  sameProgress,
  stageLabel,
  STAGES,
  type Progress,
} from "@/lib/pipeline/stages";
import { cn } from "@/lib/utils";

import { RerunButton } from "./rerun-button";

type Step = "done" | "current" | "failed" | "stale" | "pending";

function StepIcon({ step }: { step: Step }) {
  switch (step) {
    case "done":
      return (
        <span className="flex size-5 items-center justify-center rounded-full bg-incoming/15 text-incoming">
          <Check className="size-3" />
        </span>
      );
    case "current":
      return (
        <span className="flex size-5 items-center justify-center rounded-full bg-selection/15 text-selection">
          <Loader2 className="size-3 animate-spin" />
        </span>
      );
    case "failed":
      return (
        <span className="flex size-5 items-center justify-center rounded-full bg-destructive/15 text-destructive">
          <X className="size-3" />
        </span>
      );
    case "stale":
      return (
        <span className="flex size-5 items-center justify-center rounded-full bg-outgoing/15 text-outgoing">
          <AlertTriangle className="size-3" />
        </span>
      );
    default:
      return (
        <span className="flex size-5 items-center justify-center rounded-full bg-well text-muted-foreground/45">
          <Circle className="size-2 fill-current" />
        </span>
      );
  }
}

const LABEL_STYLES: Record<Step, string> = {
  done: "text-muted-foreground",
  current: "font-medium text-foreground",
  failed: "font-medium text-destructive",
  stale: "font-medium text-foreground",
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
    <section className="atlas-window mt-6 max-w-2xl overflow-hidden rounded-2xl">
      <div className="border-b border-hairline bg-chrome/70 px-5 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-[14.5px] font-medium">
              Mapping this repository
            </h2>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              The map appears automatically once every stage finishes.
            </p>
          </div>
          <span className="rounded-full bg-well px-2.5 py-0.5 font-mono text-[11.5px] font-medium tabular-nums">
            {percent}%
          </span>
        </div>

        <div
          role="progressbar"
          aria-label="Mapping stages complete"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="mt-3.5 h-1.5 w-full overflow-hidden rounded-full bg-well"
        >
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-700 ease-out",
              progress.status === "failed" ? "bg-destructive" : "bg-selection",
            )}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      <div className="p-5">
        <ol className="divide-y divide-hairline">
          {STAGES.map((entry, index) => {
            const step = stepAt(index, progress, stale);
            const detail =
              step === "current" || step === "failed" || step === "stale"
                ? progress.message
                : null;

            return (
              <li
                key={entry.stage}
                className="grid grid-cols-[1.5rem_8.5rem_minmax(0,1fr)] items-center gap-x-3 py-2.5"
              >
                <span aria-hidden title={step}>
                  <StepIcon step={step} />
                </span>
                <span className={cn("text-[12.5px]", LABEL_STYLES[step])}>
                  {entry.label}
                </span>
                <span className="min-w-0 text-[12px] break-words text-muted-foreground">
                  {detail}
                </span>
              </li>
            );
          })}
        </ol>

        {progress.stage === null && progress.message ? (
          <p className="mt-3 rounded-lg bg-well/60 px-3 py-2 font-mono text-[11.5px] text-muted-foreground">
            {progress.message}
          </p>
        ) : null}

        {progress.status === "failed" ? (
          <div className="mt-4 rounded-xl border border-destructive/25 bg-destructive/8 p-4">
            <p className="text-[12.5px] font-medium text-destructive">
              Failed at {stageLabel(progress.stage)}
            </p>
            <p className="mt-1 font-mono text-[11.5px] whitespace-pre-wrap text-destructive/90">
              {progress.message ?? "No reason was recorded."}
            </p>
            <div className="mt-3">
              <RerunButton
                analysisId={analysisId}
                onStart={() => setRestarting(true)}
                onError={rerunFailed}
              />
            </div>
          </div>
        ) : null}

        {stale && progress.status !== "failed" ? (
          <div className="mt-4 rounded-xl border border-hairline-strong bg-well/60 p-4">
            <p className="text-[12.5px] text-foreground">
              This run stopped reporting over 5 minutes ago, so it was abandoned
              rather than still working.
            </p>
            <div className="mt-3">
              <RerunButton
                analysisId={analysisId}
                onStart={() => setRestarting(true)}
                onError={rerunFailed}
              />
            </div>
          </div>
        ) : null}

        {lost ? (
          <p className="mt-4 font-mono text-[11px] text-muted-foreground">
            Live updates stopped ({lost}). Reload the page to read the
            run&apos;s current state.
          </p>
        ) : null}
      </div>
    </section>
  );
}
