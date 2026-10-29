// A file's kind is its extension: a fact read off the path, not a guess about
// what the file does. The map's row swatches and the detail pane both use it.
const NO_EXTENSION = "(none)";

/**
 * One hue per kind, a handful and no more. Anything past these is grey rather
 * than a colour nobody can tell apart.
 */
const KIND_TONES: Record<string, number> = {
  ts: 0,
  tsx: 1,
  js: 2,
  jsx: 3,
  json: 4,
  css: 5,
  md: 6,
};

export function kindOfPath(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? NO_EXTENSION : name.slice(dot + 1);
}

// Extensions display with their dot; "no extension" isn't one, so it gets none.
export function kindLabel(kind: string): string {
  return kind === NO_EXTENSION ? kind : `.${kind}`;
}

/** A 0-based palette index, or null for a kind with no hue of its own. */
export function kindTone(kind: string): number | null {
  return KIND_TONES[kind] ?? null;
}

export function kindToneOfPath(path: string): number | null {
  return kindTone(kindOfPath(path));
}

export interface KindCount {
  kind: string;
  count: number;
}

export function countKinds(paths: readonly string[]): KindCount[] {
  const counts = new Map<string, number>();
  for (const path of paths) {
    const kind = kindOfPath(path);
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([kind, count]) => ({ kind, count }))
    .sort(
      (left, right) =>
        right.count - left.count || left.kind.localeCompare(right.kind),
    );
}
