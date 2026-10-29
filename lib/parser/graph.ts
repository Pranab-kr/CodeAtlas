import type { ParsedEdge } from "./types.ts";

export interface FileFan {
  fanIn: number;
  fanOut: number;
}

/**
 * Pure graph arithmetic: distinct neighbours, not edge occurrences. An import
 * and a dynamic import between the same two files are one dependency.
 */
export function computeFanCounts(
  files: ReadonlyArray<{ path: string }>,
  edges: ReadonlyArray<Pick<ParsedEdge, "source" | "target">>,
): Map<string, FileFan> {
  const fanIn = new Map<string, Set<string>>();
  const fanOut = new Map<string, Set<string>>();

  for (const file of files) {
    fanIn.set(file.path, new Set());
    fanOut.set(file.path, new Set());
  }

  for (const edge of edges) {
    fanOut.get(edge.source)?.add(edge.target);
    fanIn.get(edge.target)?.add(edge.source);
  }

  return new Map(
    files.map((file) => [
      file.path,
      {
        fanIn: fanIn.get(file.path)?.size ?? 0,
        fanOut: fanOut.get(file.path)?.size ?? 0,
      },
    ]),
  );
}
