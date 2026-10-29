import {
  railLabel,
  type RailCategory,
  type RailKey,
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
  onToggle(category: RailKey): void;
}) {
  const total = categories.reduce(
    (sum, category) => sum + category.count,
    0,
  );

  return (
    <div className="py-2">
      <h2 className="px-3 pb-1 text-[11px] text-muted-foreground">
        Categories{" "}
        <span className="tabular-nums">· {total} files</span>
      </h2>
      <ul>
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
                    ? "flex h-6 w-full items-center gap-2 bg-selection/15 px-3 text-left shadow-[inset_2px_0_0_var(--selection)]"
                    : "flex h-6 w-full items-center gap-2 px-3 text-left hover:bg-muted/50 disabled:opacity-60 disabled:hover:bg-transparent"
                }
              >
                <span
                  aria-hidden
                  className="size-[8px] shrink-0 rounded-[2px]"
                  style={{
                    backgroundColor: `var(--kind-${categoryTone(index) + 1})`,
                  }}
                />
                <span className="min-w-0 flex-1 truncate text-[11px]">
                  {railLabel(category.key)}
                </span>
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">
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
