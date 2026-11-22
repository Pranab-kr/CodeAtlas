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
      className="sticky top-0 z-10 border-b border-hairline bg-surface/95 px-3.5 py-2.5 backdrop-blur-xs"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="min-w-0 truncate text-[11.5px] text-muted-foreground">
          File types <span className="font-medium text-foreground">· {context}</span>
        </h2>
        {active.size > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            Clear
          </button>
        )}
      </div>
      <ul className="mt-2 flex flex-wrap gap-1.5">
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
                  "inline-flex h-6.5 items-center gap-1.5 rounded-full px-2.5 font-mono text-[11px] tabular-nums transition-all duration-150",
                  on
                    ? "bg-selection/18 text-foreground ring-1 ring-inset ring-selection/50"
                    : "bg-well text-foreground/80 ring-1 ring-inset ring-hairline-strong hover:bg-raised hover:text-foreground",
                  count === 0 && !on && "text-muted-foreground opacity-55",
                )}
              >
                <span
                  aria-hidden
                  className="size-2 shrink-0 rounded-[2px]"
                  style={{
                    backgroundColor:
                      tone === null
                        ? "var(--muted-foreground)"
                        : `var(--kind-${tone + 1})`,
                  }}
                />
                <span>{kindLabel(kind)}</span>
                <span className="text-[10.5px] text-muted-foreground">
                  {count}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
