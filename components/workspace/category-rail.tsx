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
    <div className="py-2">
      <h2 className="px-3 pb-1 text-[11px] text-muted-foreground">
        Categories{" "}
        <span className="tabular-nums">· {total} files</span>
      </h2>
      <ul>
        {categories.map((category, index) => (
          <li
            key={category.key || "root"}
            className="flex h-6 items-center gap-2 px-3"
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
          </li>
        ))}
      </ul>
    </div>
  );
}
