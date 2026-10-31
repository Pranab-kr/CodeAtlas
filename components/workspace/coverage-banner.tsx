"use client";

import { useState } from "react";

import {
  coverageSummary,
  type Coverage,
} from "@/lib/analysis/coverage";

/**
 * A graph that is quietly thirty percent complete must never look complete.
 * The collapsed line still names the figure.
 */
export function CoverageBanner({ coverage }: { coverage: Coverage }) {
  const [open, setOpen] = useState(true);
  const summary = coverageSummary(coverage);

  if (!summary.partial) {
    return null;
  }

  const percent = summary.percent;
  const figure =
    percent === null
      ? "no local references to resolve"
      : percent === 100
        ? "all local references resolved"
        : `${percent.toFixed(1)}% of local references resolved`;

  return (
    <div className="shrink-0 border-b border-border bg-muted/40">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-baseline gap-2 px-3 py-1.5 text-left transition-colors hover:bg-muted/20"
      >
        <span
          aria-hidden
          className="font-mono text-[10px] text-muted-foreground"
        >
          {open ? "▾" : "▸"}
        </span>
        <span className="min-w-0 text-[10.5px] text-foreground">
          Partial graph:{" "}
          <span className="font-mono tabular-nums">{figure}</span>
          {summary.unresolved > 0 ? (
            <span className="font-mono tabular-nums">
              {" "}
              ({summary.unresolved} of {summary.local})
            </span>
          ) : null}
          {summary.skipped > 0 ? (
            <span className="font-mono tabular-nums">
              , {summary.skipped} files skipped
            </span>
          ) : null}
        </span>
      </button>

      {open ? (
        <p className="border-t border-border/60 px-3 py-1.5 pl-8 text-[10.5px] text-muted-foreground">
          Edges exist only where an import or re-export resolved to a file in
          this repository. The rest are counted here, not guessed.
        </p>
      ) : null}
    </div>
  );
}
