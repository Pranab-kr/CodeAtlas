import type { ParsedFile } from "@/lib/parser/types";

const CATEGORY_TONE_ORDER = [9, 10, 11, 7, 8, 6, 4, 5, 2, 3, 0, 1];

export function categoryTone(index: number): number {
  return CATEGORY_TONE_ORDER[index % CATEGORY_TONE_ORDER.length];
}

export interface FileCategory {
  key: string;
  name: string;
  count: number;
}

/**
 * Roles stay null until the framework adapters arrive, so the rail groups by
 * the repository's top-level folders. The folder already comes from the parser
 * contract; nothing here looks at a filename.
 */
export function categoriesFromFiles(
  files: readonly ParsedFile[],
): FileCategory[] {
  const counts = new Map<string, number>();

  for (const file of files) {
    const key = file.folder === "." ? "" : file.folder.split("/")[0];
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([key, count]) => ({
      key,
      name: key === "" ? "(root)" : key,
      count,
    }))
    .sort(
      (left, right) =>
        right.count - left.count || left.name.localeCompare(right.name),
    );
}

export function categoryKeyOfPath(path: string): string {
  const slash = path.indexOf("/");
  return slash === -1 ? "" : path.slice(0, slash);
}

/**
 * The rail and the map must agree on which hue belongs to a category. Both
 * derive it from the same sorted category list.
 */
export function categoryToneMap(
  files: readonly ParsedFile[],
): Map<string, number> {
  return new Map(
    categoriesFromFiles(files).map((category, index) => [
      category.key,
      categoryTone(index),
    ]),
  );
}
