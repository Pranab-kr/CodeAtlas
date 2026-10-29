import type { ParsedEdge, ParsedFile } from "@/lib/parser/types";

import { shortestUniqueDirectoryLabels, shortestUniqueSuffixes } from "./labels.ts";

const START_THRESHOLD = 2;
const TARGET_NODE_COUNT = 24;

export interface FoldedFile {
  path: string;
  label: string;
  fanIn: number;
  fanOut: number;
}

export interface FoldedModule {
  id: string;
  directory: string;
  label: string;
  files: FoldedFile[];
  fanIn: number;
  fanOut: number;
}

export interface FilePair {
  source: string;
  target: string;
}

export interface FoldedEdge {
  source: string;
  target: string;
  files: FilePair[];
}

export interface FoldResult {
  threshold: number;
  modules: FoldedModule[];
  edges: FoldedEdge[];
  moduleByFile: Map<string, string>;
}

export interface FoldOptions {
  rootLabel: string;
  targetNodeCount?: number;
}

/**
 * Every directory is a node, then thin directories merge into their parent,
 * deepest first. Each threshold is recomputed from the original tree; raising
 * it is the only thing that changes between passes.
 */
export function foldModules(
  files: readonly ParsedFile[],
  edges: readonly ParsedEdge[],
  options: FoldOptions,
): FoldResult {
  const directories = collectDirectories(files);
  const directFiles = groupDirectFiles(directories, files);
  const deepestFirst = [...directories].sort(
    (left, right) =>
      depth(right) - depth(left) || left.localeCompare(right),
  );

  const target = options.targetNodeCount ?? TARGET_NODE_COUNT;
  let threshold = START_THRESHOLD;
  let pass = groupAtThreshold(directories, directFiles, deepestFirst, threshold);

  while (survivingCount(pass.groups) > target && threshold < files.length + 1) {
    threshold += 1;
    pass = groupAtThreshold(directories, directFiles, deepestFirst, threshold);
  }

  const surviving = [...pass.groups.entries()]
    .filter(([, group]) => group.length > 0)
    .sort(([left], [right]) => left.localeCompare(right));

  const directoryLabels = shortestUniqueDirectoryLabels(
    surviving.map(([directory]) => directory),
    options.rootLabel,
  );

  const moduleByFile = new Map<string, string>();
  const modules: FoldedModule[] = surviving.map(([directory, group]) => {
    const sorted = [...group].sort((left, right) =>
      left.path.localeCompare(right.path),
    );
    const labels = shortestUniqueSuffixes(sorted.map((file) => file.path));

    for (const file of sorted) {
      moduleByFile.set(file.path, directory);
    }

    return {
      id: directory,
      directory,
      label: directoryLabels.get(directory) ?? directory,
      files: sorted.map((file) => ({
        path: file.path,
        label: labels.get(file.path) ?? file.path,
        fanIn: file.fanIn,
        fanOut: file.fanOut,
      })),
      fanIn: 0,
      fanOut: 0,
    };
  });

  const foldedEdges = foldEdges(edges, moduleByFile);
  const fanOut = new Map<string, Set<string>>();
  const fanIn = new Map<string, Set<string>>();

  for (const edge of foldedEdges) {
    getSet(fanOut, edge.source).add(edge.target);
    getSet(fanIn, edge.target).add(edge.source);
  }

  for (const entry of modules) {
    entry.fanIn = fanIn.get(entry.id)?.size ?? 0;
    entry.fanOut = fanOut.get(entry.id)?.size ?? 0;
  }

  return {
    threshold,
    modules,
    edges: foldedEdges,
    moduleByFile,
  };
}

function collectDirectories(files: readonly ParsedFile[]): Set<string> {
  const directories = new Set<string>(["."]);

  for (const file of files) {
    let directory = file.folder;
    while (directory !== ".") {
      directories.add(directory);
      directory = parentOf(directory);
    }
  }

  return directories;
}

function groupDirectFiles(
  directories: ReadonlySet<string>,
  files: readonly ParsedFile[],
): Map<string, ParsedFile[]> {
  const direct = new Map<string, ParsedFile[]>();
  for (const directory of directories) {
    direct.set(directory, []);
  }
  for (const file of files) {
    direct.get(file.folder)?.push(file);
  }
  return direct;
}

interface PassResult {
  groups: Map<string, ParsedFile[]>;
}

function groupAtThreshold(
  directories: ReadonlySet<string>,
  directFiles: ReadonlyMap<string, ParsedFile[]>,
  deepestFirst: readonly string[],
  threshold: number,
): PassResult {
  const groups = new Map<string, ParsedFile[]>();
  for (const directory of directories) {
    groups.set(directory, [...(directFiles.get(directory) ?? [])]);
  }

  for (const directory of deepestFirst) {
    if (directory === ".") {
      continue;
    }

    const group = groups.get(directory);
    if (!group || group.length >= threshold) {
      continue;
    }

    const parent = parentOf(directory);
    groups.get(parent)?.push(...group);
    groups.set(directory, []);
  }

  return { groups };
}

function foldEdges(
  edges: readonly ParsedEdge[],
  moduleByFile: ReadonlyMap<string, string>,
): FoldedEdge[] {
  const byModules = new Map<string, FoldedEdge>();

  for (const edge of edges) {
    const source = moduleByFile.get(edge.source);
    const target = moduleByFile.get(edge.target);

    if (!source || !target) {
      throw new Error(
        `Edge endpoint missing from folded files: ${edge.source} -> ${edge.target}`,
      );
    }

    if (source === target) {
      continue;
    }

    const key = `${source}\u0000${target}`;
    let folded = byModules.get(key);
    if (!folded) {
      folded = { source, target, files: [] };
      byModules.set(key, folded);
    }
    folded.files.push({ source: edge.source, target: edge.target });
  }

  return [...byModules.values()]
    .sort(
      (left, right) =>
        left.source.localeCompare(right.source) ||
        left.target.localeCompare(right.target),
    )
    .map((edge) => ({
      ...edge,
      files: [...edge.files].sort(
        (left, right) =>
          left.source.localeCompare(right.source) ||
          left.target.localeCompare(right.target),
      ),
    }));
}

function survivingCount(groups: ReadonlyMap<string, ParsedFile[]>): number {
  let count = 0;
  for (const group of groups.values()) {
    if (group.length > 0) {
      count += 1;
    }
  }
  return count;
}

function getSet(
  map: Map<string, Set<string>>,
  key: string,
): Set<string> {
  let set = map.get(key);
  if (!set) {
    set = new Set<string>();
    map.set(key, set);
  }
  return set;
}

function parentOf(directory: string): string {
  const slash = directory.lastIndexOf("/");
  return slash === -1 ? "." : directory.slice(0, slash);
}

function depth(directory: string): number {
  return directory === "." ? 0 : directory.split("/").length;
}
