/**
 * Greedy shortest-suffix labels. Paths are processed shortest first, so the
 * shallower path keeps the short name and the deeper duplicate extends.
 */
export function shortestUniqueSuffixes(
  paths: readonly string[],
): Map<string, string> {
  const used = new Set<string>();
  const labels = new Map<string, string>();
  const ordered = [...paths].sort(
    (left, right) =>
      segmentCount(left) - segmentCount(right) ||
      left.localeCompare(right),
  );

  for (const path of ordered) {
    labels.set(path, uniqueSuffix(path, used));
  }

  return labels;
}

export function shortestUniqueDirectoryLabels(
  directories: readonly string[],
  rootLabel: string,
): Map<string, string> {
  const used = new Set<string>([rootLabel]);
  const labels = new Map<string, string>();

  const ordered = directories
    .filter((directory) => directory !== ".")
    .sort(
      (left, right) =>
        segmentCount(left) - segmentCount(right) ||
        left.localeCompare(right),
    );

  for (const directory of ordered) {
    labels.set(directory, uniqueSuffix(directory, used));
  }

  if (directories.includes(".")) {
    labels.set(".", rootLabel);
  }

  return labels;
}

function uniqueSuffix(path: string, used: Set<string>): string {
  const segments = path.split("/").filter((segment) => segment !== "");
  let length = Math.min(1, segments.length);
  let label = segments.slice(-length).join("/");

  while (used.has(label) && length < segments.length) {
    length += 1;
    label = segments.slice(-length).join("/");
  }

  while (used.has(label)) {
    label = `./${label}`;
  }

  used.add(label);
  return label;
}

function segmentCount(path: string): number {
  return path.split("/").filter((segment) => segment !== "").length;
}
