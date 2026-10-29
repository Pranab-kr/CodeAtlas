import type { ParsedEdge, ParsedFile } from "@/lib/parser/types";

import { isConventionEntry } from "./entry-points.ts";

// Four facts about the file and edge lists. Pure, and nothing here is worded
// by a model: each kind says one fixed sentence, and the files under it are
// the evidence.

/** Past this many lines a file is listed as long. Fixed, so the list means the same in every repository. */
export const LONG_FILE_LINES = 1000;

export const INSIGHT_SENTENCES = {
  unimported:
    "Nothing imports these files, and no framework or tool convention reaches them.",
  heavilyImported:
    "Far more files import these than import a typical file here.",
  cycles: "Each file in a loop imports the next, and the last imports the first.",
  long: `These files are over ${LONG_FILE_LINES.toLocaleString("en")} lines long.`,
} as const;

export interface Cycle {
  /** One shortest loop, in import order; the last file imports the first. */
  files: string[];
  /** How many files are mutually reachable with it, the loop included. */
  members: number;
}

export interface Insights {
  unimported: ParsedFile[];
  heavilyImported: { files: ParsedFile[]; threshold: number };
  cycles: Cycle[];
  long: ParsedFile[];
}

export function findInsights(
  files: readonly ParsedFile[],
  edges: readonly ParsedEdge[],
): Insights {
  // A file the framework, a tool or the test runner reaches isn't unused just
  // because no import leads to it: that would be the parser reporting the
  // edge of its own view as a finding about the code.
  const unimported = files
    .filter(
      (file) => file.fanIn === 0 && !isConventionEntry(file.path),
    )
    .sort(byPath);

  const threshold = farOutFence(
    files.filter((file) => file.fanIn > 0).map((file) => file.fanIn),
  );
  const heavilyImported = files
    .filter((file) => file.fanIn > threshold)
    .sort(
      (left, right) =>
        right.fanIn - left.fanIn || byPath(left, right),
    );

  const long = files
    .filter((file) => file.lines > LONG_FILE_LINES)
    .sort(
      (left, right) => right.lines - left.lines || byPath(left, right),
    );

  return {
    unimported,
    heavilyImported: { files: heavilyImported, threshold },
    cycles: findCycles(files, edges),
    long,
  };
}

// Tukey's far-out fence: the third quartile plus three interquartile ranges.
// Relative to this repository, so "unusual" means unusual here.
function farOutFence(values: readonly number[]): number {
  if (values.length === 0) {
    return Infinity;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const quartile = (fraction: number): number =>
    sorted[Math.floor(fraction * (sorted.length - 1))] ?? 0;
  const first = quartile(0.25);
  const third = quartile(0.75);
  return third + 3 * (third - first);
}

/**
 * Every strongly connected component with a loop in it, each shown as one
 * shortest loop through its first file, largest component first.
 */
export function findCycles(
  files: readonly ParsedFile[],
  edges: readonly ParsedEdge[],
): Cycle[] {
  const next = new Map<string, string[]>();
  for (const file of files) {
    next.set(file.path, []);
  }
  for (const edge of edges) {
    next.get(edge.source)?.push(edge.target);
  }
  for (const list of next.values()) {
    list.sort();
  }

  const cycles: Cycle[] = [];
  for (const component of stronglyConnected(next)) {
    const [first] = component;
    if (first === undefined) {
      continue;
    }

    const selfLoop = next.get(first)?.includes(first) ?? false;
    if (component.length === 1 && !selfLoop) {
      continue;
    }

    const loop = shortestLoop(next, first, new Set(component));
    if (loop) {
      cycles.push({ files: loop, members: component.length });
    }
  }

  return cycles.sort(
    (left, right) =>
      right.members - left.members ||
      left.files[0].localeCompare(right.files[0]),
  );
}

// Tarjan's algorithm with an explicit stack of frames instead of recursion: a
// real repository has import chains deep enough to overflow the call stack.
// Each component comes back sorted.
function stronglyConnected(
  next: ReadonlyMap<string, readonly string[]>,
): string[][] {
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const components: string[][] = [];
  let counter = 0;

  const enter = (file: string): void => {
    index.set(file, counter);
    low.set(file, counter);
    counter += 1;
    stack.push(file);
    onStack.add(file);
  };

  for (const root of [...next.keys()].sort()) {
    if (index.has(root)) {
      continue;
    }

    enter(root);
    const frames: { file: string; next: number }[] = [
      { file: root, next: 0 },
    ];

    while (frames.length > 0) {
      const frame = frames[frames.length - 1];
      const successors = next.get(frame.file) ?? [];

      if (frame.next < successors.length) {
        const successor = successors[frame.next];
        frame.next += 1;

        if (!index.has(successor)) {
          enter(successor);
          frames.push({ file: successor, next: 0 });
        } else if (onStack.has(successor)) {
          low.set(
            frame.file,
            Math.min(
              low.get(frame.file) ?? 0,
              index.get(successor) ?? 0,
            ),
          );
        }
        continue;
      }

      frames.pop();
      const parent = frames[frames.length - 1];
      if (parent) {
        low.set(
          parent.file,
          Math.min(
            low.get(parent.file) ?? 0,
            low.get(frame.file) ?? 0,
          ),
        );
      }

      if (low.get(frame.file) === index.get(frame.file)) {
        const component: string[] = [];
        for (;;) {
          const member = stack.pop();
          if (member === undefined) {
            break;
          }
          onStack.delete(member);
          component.push(member);
          if (member === frame.file) {
            break;
          }
        }
        components.push(component.sort());
      }
    }
  }

  return components;
}

// Breadth-first from `start` inside its component until an edge leads back to
// it, so the loop shown is one of the shortest, and every step in it is an
// edge that exists.
function shortestLoop(
  next: ReadonlyMap<string, readonly string[]>,
  start: string,
  within: ReadonlySet<string>,
): string[] | null {
  const parent = new Map<string, string>();
  const seen = new Set([start]);
  let frontier = [start];

  while (frontier.length > 0) {
    const found: string[] = [];
    for (const file of frontier) {
      for (const other of next.get(file) ?? []) {
        if (other === start) {
          const loop = [file];
          for (let at = file; at !== start; ) {
            const previous = parent.get(at);
            if (previous === undefined) {
              break;
            }
            loop.push(previous);
            at = previous;
          }
          return loop.reverse();
        }

        if (!within.has(other) || seen.has(other)) {
          continue;
        }
        seen.add(other);
        parent.set(other, file);
        found.push(other);
      }
    }
    frontier = found;
  }

  return null;
}

function byPath(left: ParsedFile, right: ParsedFile): number {
  return left.path.localeCompare(right.path);
}
