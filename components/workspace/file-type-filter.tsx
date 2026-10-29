"use client";

import { cn } from "@/lib/utils";
import {
  kindLabel,
  kindTone,
  type KindCount,
} from "@/lib/workspace/kinds";

/**
 * Which file types the detail pane lists. The counts describe whatever the
 * pane is currently about — a blast radius, a folder, the repository — not the
 * whole repository every time. Multi-select; no selection means every type.
 */
export function FileTypeFilter({
  counts,
  context,
  active,
  onToggle,
  onClear,
}: {
  counts: readonly KindCount[];
  /** What the counts are counting, shown after the heading. */
  context: string;
  active: ReadonlySet<string>;
  onToggle(kind: string): void;
  onClear(): void;
}) {
  return (
    <section
      aria-label="File types"
      className="sticky top-0 z-10 border-b border-border bg-background px-3 py-2"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="min-w-0 truncate text-[10px] text-muted-foreground">
          File types <span className="text-foreground">· {context}</span>
        </h2>
        {active.size > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="shrink-0 text-[10px] text-muted-foreground hover:text-foreground hover:underline"
          >
            Clear
          </button>
        )}
      </div>
      <ul className="mt-1 flex flex-wrap gap-1">
        {counts.map(({ kind, count }) => {
          const on = active.has(kind);
          const tone = kindTone(kind);
          return (
            <li key={kind}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => onToggle(kind)}
                title={`${kindLabel(kind)} — ${count} ${
                  count === 1 ? "file" : "files"
                } in ${context}`}
                className={cn(
                  "flex h-5 items-center gap-1 rounded-[3px] border px-1.5 font-mono text-[10.5px] tabular-nums",
                  on
                    ? "border-selection bg-selection/15 text-foreground"
                    : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground",
                  count === 0 && !on && "opacity-50",
                )}
              >
                <span
                  aria-hidden
                  className="size-[7px] shrink-0 rounded-[2px]"
                  style={{
                    backgroundColor:
                      tone === null
                        ? "var(--muted-foreground)"
                        : `var(--kind-${tone + 1})`,
                  }}
                />
                {kindLabel(kind)}
                <span>{count}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
