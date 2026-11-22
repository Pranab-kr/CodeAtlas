import {
  railLabel,
  type RailCategory,
} from "@/lib/roles";
import { categoryTone } from "@/lib/workspace/categories";

/**
 * The categories are the roles this repository's framework defines, in the
 * taxonomy's fixed order, with every one of them listed even at zero so each
 * sits in the same place every time. Clicking one dims what isn't in it on the
 * map rather than hiding it, so the shape of the whole repository stays on
 * screen. Clicking the focused one again clears the focus.
 */
export function CategoryRail({
  categories,
  active,
  onToggle,
}: {
  categories: readonly RailCategory[];
  active: string | null;
  onToggle(category: string): void;
}) {
  const total = categories.reduce(
    (sum, category) => sum + category.count,
    0,
  );

  return (
    <div className="py-3">
      <div className="flex items-center justify-between gap-2 px-3.5 pb-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <h2 className="text-[11.5px] font-medium text-foreground">
            Roles
          </h2>
          <span className="rounded-full bg-well px-1.5 py-px font-mono text-[10px] text-muted-foreground tabular-nums">
            {total}
          </span>
        </div>
        {active ? (
          <button
            type="button"
            onClick={() => onToggle(active)}
            className="rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
          >
            Clear
          </button>
        ) : null}
      </div>
      <ul className="space-y-0.5 px-2">
        {categories.map((category, index) => {
          const on = active === category.key;
          return (
            <li key={category.key}>
              <button
                type="button"
                aria-pressed={on}
                disabled={category.count === 0}
                onClick={() => onToggle(category.key)}
                className={
                  on
                    ? "flex h-7 w-full items-center gap-2 rounded-lg bg-selection/14 px-2.5 text-left text-foreground ring-1 ring-inset ring-selection/30 transition-colors"
                    : "flex h-7 w-full items-center gap-2 rounded-lg px-2.5 text-left text-muted-foreground transition-colors hover:bg-surface/80 hover:text-foreground disabled:opacity-45 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                }
              >
                <span
                  aria-hidden
                  className="size-2 shrink-0 rounded-[3px]"
                  style={{
                    backgroundColor: `var(--kind-${categoryTone(index) + 1})`,
                  }}
                />
                <span className="min-w-0 flex-1 truncate text-[12px]">
                  {railLabel(category.key)}
                </span>
                <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground tabular-nums">
                  {category.count}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
