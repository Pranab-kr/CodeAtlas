import {
  categoryTone,
  type FileCategory,
} from "@/lib/workspace/categories";

export function CategoryRail({
  categories,
}: {
  categories: readonly FileCategory[];
}) {
  const total = categories.reduce(
    (sum, category) => sum + category.count,
    0,
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-7 shrink-0 items-center border-b border-border px-3">
        <span className="font-mono text-[10.5px] text-muted-foreground">
          categories
        </span>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto py-1">
        {categories.map((category, index) => (
          <li
            key={category.key || "root"}
            className="flex h-7 items-center gap-2 px-3"
          >
            <span
              aria-hidden
              className="size-2 shrink-0"
              style={{
                backgroundColor: `var(--kind-${categoryTone(index) + 1})`,
              }}
            />
            <span
              className="min-w-0 truncate font-mono text-[11px]"
              title={category.name}
            >
              {category.name}
            </span>
            <span className="ml-auto font-mono text-[10.5px] text-muted-foreground tabular-nums">
              {category.count}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex h-7 shrink-0 items-center border-t border-border px-3 font-mono text-[10.5px] text-muted-foreground tabular-nums">
        {total} files
      </div>
    </div>
  );
}
