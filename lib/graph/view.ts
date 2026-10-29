import type { ParsedEdge } from "@/lib/parser/types";

import type { FoldResult } from "./fold.ts";
import { shortestUniqueSuffixes } from "./labels.ts";

/** Rows a panel shows at once. Past this it scrolls through a window of them. */
export const MAX_ROWS = 14;
/** Handles standing for the rows scrolled out above and below the window. */
export const ABOVE_HANDLE = "^";
export const BELOW_HANDLE = "v";

export interface Row {
  path: string;
  label: string;
  fanIn: number;
  fanOut: number;
}

interface ObjectCommon {
  id: string;
  directory: string;
  label: string;
  fileCount: number;
  fanIn: number;
  fanOut: number;
}

export type FoldedObject = ObjectCommon & { kind: "folded" };

export type PanelObject = ObjectCommon & {
  kind: "panel";
  rows: Row[];
  /** Whether the files outnumber the window, so the panel shows strips. */
  scrolls: boolean;
  /** Index of the first shown row among all the group's ranked files. */
  offset: number;
  above: number;
  below: number;
  /** Longest row label at any offset, so the panel width holds still. */
  rowChars: number;
};

export type MapObject = FoldedObject | PanelObject;

export interface MapEdge {
  id: string;
  source: string;
  /** A row's path inside a panel, an above/below handle, or null. */
  sourceHandle: string | null;
  target: string;
  targetHandle: string | null;
  /** How many file-level edges this one line stands for. */
  count: number;
}

export interface Endpoint {
  object: string;
  handle: string | null;
}

export interface MapView {
  objects: MapObject[];
  edges: MapEdge[];
  /** What currently stands for each file on the canvas. */
  endpointOf: ReadonlyMap<string, Endpoint>;
  /** Endpoints of every file this one is connected to, drawn or not. */
  neighborsOf: ReadonlyMap<string, ReadonlySet<string>>;
}

/**
 * What's on the canvas for a set of open panels: one object per folded group,
 * either closed or opened into a window of its ranked files. The parse output
 * is not reshaped; every line here comes from an edge in it.
 */
export function buildView(
  fold: FoldResult,
  edges: readonly ParsedEdge[],
  expanded: ReadonlySet<string>,
  offsets: ReadonlyMap<string, number>,
): MapView {
  const rankedByModule = new Map<string, string[]>();
  for (const group of fold.modules) {
    rankedByModule.set(group.id, rankModulePaths(group.files));
  }

  const windows = new Map<
    string,
    { ranked: string[]; offset: number; shown: string[] }
  >();
  for (const group of fold.modules) {
    if (!expanded.has(group.id)) {
      continue;
    }
    const ranked = rankedByModule.get(group.id) ?? [];
    const offset = clampOffset(offsets.get(group.id) ?? 0, ranked.length);
    windows.set(group.id, {
      ranked,
      offset,
      shown: ranked.slice(offset, offset + MAX_ROWS),
    });
  }

  const shownRows = [...windows.values()].flatMap((window) => window.shown);
  const widestRows = [...windows.values()].flatMap(
    (window) => window.ranked,
  );
  const rowLabels = shortestUniqueSuffixes(shownRows);
  const widestLabels = shortestUniqueSuffixes(widestRows);

  const objects = fold.modules.map((group): MapObject => {
    const common: ObjectCommon = {
      id: group.id,
      directory: group.directory,
      label: group.label,
      fileCount: group.files.length,
      fanIn: group.fanIn,
      fanOut: group.fanOut,
    };
    const window = windows.get(group.id);
    if (!window) {
      return { ...common, kind: "folded" };
    }

    const byPath = new Map(group.files.map((file) => [file.path, file]));
    return {
      ...common,
      kind: "panel",
      scrolls: window.ranked.length > MAX_ROWS,
      offset: window.offset,
      above: window.offset,
      below:
        window.ranked.length - window.offset - window.shown.length,
      rowChars: Math.max(
        0,
        ...window.ranked.map(
          (path) => widestLabels.get(path)?.length ?? path.length,
        ),
      ),
      rows: window.shown.map((path) => {
        const file = byPath.get(path);
        return {
          path,
          label: rowLabels.get(path) ?? file?.label ?? path,
          fanIn: file?.fanIn ?? 0,
          fanOut: file?.fanOut ?? 0,
        };
      }),
    };
  });

  const endpointOf = new Map<string, Endpoint>();
  for (const group of fold.modules) {
    const window = windows.get(group.id);
    if (!window) {
      for (const file of group.files) {
        endpointOf.set(file.path, {
          object: group.id,
          handle: null,
        });
      }
      continue;
    }

    window.ranked.forEach((path, index) => {
      const handle =
        index < window.offset
          ? ABOVE_HANDLE
          : index >= window.offset + window.shown.length
            ? BELOW_HANDLE
            : path;
      endpointOf.set(path, { object: group.id, handle });
    });
  }

  const neighborsOf = new Map<string, Set<string>>();
  const merged = new Map<string, MapEdge>();

  for (const edge of edges) {
    const source = endpointOf.get(edge.source);
    const target = endpointOf.get(edge.target);
    if (!source || !target) {
      throw new Error(
        `Edge endpoint outside the folding: ${edge.source} -> ${edge.target}`,
      );
    }

    const sourceKey = endpointKey(source.object, source.handle);
    const targetKey = endpointKey(target.object, target.handle);
    addNeighbor(neighborsOf, edge.source, targetKey);
    addNeighbor(neighborsOf, edge.target, sourceKey);

    // An edge that starts and ends inside the same canvas object isn't drawn:
    // it would loop back into its own box. It still counts in the file's fan.
    if (source.object === target.object) {
      continue;
    }

    const id = `${sourceKey}>${targetKey}`;
    const existing = merged.get(id);
    if (existing) {
      existing.count += 1;
    } else {
      merged.set(id, {
        id,
        source: source.object,
        sourceHandle: source.handle,
        target: target.object,
        targetHandle: target.handle,
        count: 1,
      });
    }
  }

  return {
    objects,
    edges: [...merged.values()].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
    endpointOf,
    neighborsOf,
  };
}

/**
 * The order a panel puts its files in: most depended on first. Exported so
 * anything scrolling a panel to a file finds it where the panel will.
 */
export function rankModulePaths(
  files: readonly { path: string; fanIn: number }[],
): string[] {
  return [...files]
    .sort(
      (left, right) =>
        right.fanIn - left.fanIn || left.path.localeCompare(right.path),
    )
    .map((file) => file.path);
}

export function endpointKey(
  object: string,
  handle: string | null,
): string {
  return `${object}|${handle ?? ""}`;
}

export function clampOffset(requested: number, total: number): number {
  return Math.max(0, Math.min(Math.round(requested), total - MAX_ROWS));
}

function addNeighbor(
  map: Map<string, Set<string>>,
  key: string,
  value: string,
): void {
  const set = map.get(key) ?? new Set<string>();
  set.add(value);
  map.set(key, set);
}
