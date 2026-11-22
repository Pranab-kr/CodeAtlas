"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
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
    <div className="shrink-0 border-b border-hairline bg-surface/90">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center gap-2 px-3.5 py-2 text-left transition-colors hover:bg-muted/35"
      >
        {open ? (
          <ChevronDown
            className="size-3.5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        ) : (
          <ChevronRight
            className="size-3.5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        )}
        <span
          aria-hidden
          className="size-1.5 shrink-0 rounded-full bg-outgoing"
        />
        <span className="min-w-0 text-[11.5px] text-foreground">
          <span className="font-medium">Partial graph:</span>{" "}
          <span className="font-mono text-[11px] tabular-nums">{figure}</span>
          {summary.unresolved > 0 ? (
            <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
              {" "}
              ({summary.unresolved} of {summary.local})
            </span>
          ) : null}
          {summary.skipped > 0 ? (
            <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
              , {summary.skipped} files skipped
            </span>
          ) : null}
        </span>
      </button>

      {open ? (
        <p className="border-t border-hairline bg-chrome/60 px-3.5 py-2 pl-9 text-[11.5px] leading-relaxed text-muted-foreground">
          Edges exist only where an import or re-export resolved to a file in
          this repository. The rest are counted here, not guessed.
        </p>
      ) : null}
    </div>
  );
}
