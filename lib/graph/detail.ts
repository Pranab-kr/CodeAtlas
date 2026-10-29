import type {
  EdgeKind,
  ParsedEdge,
  ParsedFile,
} from "@/lib/parser/types";

// What the detail pane lists, as arithmetic over the file and edge lists. Pure,
// so the pane never has to ask anything for it.

/** How many rows each summary ranking shows before saying how many more. */
export const SUMMARY_LIMIT = 10;

const EDGE_KIND_ORDER: readonly EdgeKind[] = [
  "import",
  "reexport",
  "dynamic",
  "require",
];

export interface Neighbour {
  path: string;
  /** Every kind of edge between the two files, in contract order. */
  kinds: EdgeKind[];
}

export interface Neighbours {
  imports: Neighbour[];
  importedBy: Neighbour[];
}

/**
 * One row per distinct file on the other side, the same unit fan-in and fan-out
 * count, so a list's length is the count shown above it.
 */
export function neighboursOf(
  edges: readonly ParsedEdge[],
  path: string,
): Neighbours {
  const imports = new Map<string, Set<EdgeKind>>();
  const importedBy = new Map<string, Set<EdgeKind>>();

  for (const edge of edges) {
    if (edge.source === path) {
      addKind(imports, edge.target, edge.kind);
    }
    if (edge.target === path) {
      addKind(importedBy, edge.source, edge.kind);
    }
  }

  return {
    imports: sorted(imports),
    importedBy: sorted(importedBy),
  };
}

function addKind(
  into: Map<string, Set<EdgeKind>>,
  other: string,
  kind: EdgeKind,
): void {
  const kinds = into.get(other) ?? new Set<EdgeKind>();
  kinds.add(kind);
  into.set(other, kinds);
}

function sorted(
  map: ReadonlyMap<string, ReadonlySet<EdgeKind>>,
): Neighbour[] {
  return [...map.entries()]
    .map(([path, kinds]) => ({
      path,
      kinds: EDGE_KIND_ORDER.filter((kind) => kinds.has(kind)),
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

export interface Ranked {
  files: ParsedFile[];
  /** How many files the ranking holds before the display limit. */
  total: number;
}

export interface RepositoryRankings {
  /** Files something imports, most importers first. */
  mostDependedOn: Ranked;
  /**
   * Files nothing imports. The ones importing the most come first: nothing
   * leads into them and they lead into the most, so reading starts there.
   */
  unimported: Ranked;
}

export function rankRepository(
  files: readonly ParsedFile[],
): RepositoryRankings {
  const depended = files
    .filter((file) => file.fanIn > 0)
    .sort(
      (left, right) =>
        right.fanIn - left.fanIn || left.path.localeCompare(right.path),
    );
  const unimported = files
    .filter((file) => file.fanIn === 0)
    .sort(
      (left, right) =>
        right.fanOut - left.fanOut || left.path.localeCompare(right.path),
    );

  return {
    mostDependedOn: {
      files: depended.slice(0, SUMMARY_LIMIT),
      total: depended.length,
    },
    unimported: {
      files: unimported.slice(0, SUMMARY_LIMIT),
      total: unimported.length,
    },
  };
}

export function unidentifiedCount(files: readonly ParsedFile[]): number {
  return files.filter((file) => file.role === null).length;
}
