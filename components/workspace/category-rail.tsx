import {
  categoryTone,
  type FileCategory,
} from "@/lib/workspace/categories";

/**
 * Clicking a category focuses it: the map dims everything outside it rather
 * than removing it, so the shape of the whole repository stays on screen.
 * Clicking the focused one again clears the focus.
 */
export function CategoryRail({
  categories,
  active,
  onToggle,
}: {
  categories: readonly FileCategory[];
  active: string | null;
  onToggle(category: string): void;
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
            <li key={category.key || "root"}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => onToggle(category.key)}
                className={
                  on
                    ? "flex h-6 w-full items-center gap-2 bg-selection/15 px-3 text-left shadow-[inset_2px_0_0_var(--selection)]"
                    : "flex h-6 w-full items-center gap-2 px-3 text-left hover:bg-muted/50"
                }
              >
                <span
                  aria-hidden
                  className="size-[8px] shrink-0 rounded-[2px]"
                  style={{
                    backgroundColor: `var(--kind-${categoryTone(index) + 1})`,
                  }}
                />
                <span
                  className="min-w-0 flex-1 truncate font-mono text-[11px]"
                  title={category.name}
                >
                  {category.name}
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
