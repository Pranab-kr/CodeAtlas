import type { StoredMap } from "@/lib/analysis/load";
import { coverageSummary } from "@/lib/analysis/coverage";
import { neighboursOf, rankRepository, unidentifiedCount } from "@/lib/graph/detail";
import { findInsights } from "@/lib/graph/insights";
import {
  adjacency,
  reach,
  type Direction,
} from "@/lib/graph/reach";
import type { ParsedFile } from "@/lib/parser/types";
import { isRole, ROLE_IDS, type Role } from "@/lib/roles";

import type { AgentSource } from "./read";

export const AGENT_TOOL_NAMES = [
  "analysis_summary",
  "search_files",
  "list_files_by_role",
  "file_neighbours",
  "walk",
  "routes",
] as const;

export type AgentToolName = (typeof AGENT_TOOL_NAMES)[number];

export function isAgentToolName(value: string): value is AgentToolName {
  return (AGENT_TOOL_NAMES as readonly string[]).includes(value);
}

export type AgentToolRequest =
  | { tool: "analysis_summary"; arguments: Record<string, never> }
  | {
      tool: "search_files";
      arguments: { query: string; limit: number };
    }
  | {
      tool: "list_files_by_role";
      arguments: { role: Role; limit: number };
    }
  | { tool: "file_neighbours"; arguments: { path: string } }
  | {
      tool: "walk";
      arguments: {
        path: string;
        direction: Direction;
        depth: number;
      };
    }
  | { tool: "routes"; arguments: Record<string, never> };

export class AgentToolError extends Error {
  override name = "AgentToolError";
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const MAX_SEARCH = 50;
const MAX_ROLE_FILES = 50;
const MAX_STEP_FILES = 50;
const MAX_ROUTES = 100;

export interface AgentFileFact {
  path: string;
  role: Role | null;
  lines: number;
  fanIn: number;
  fanOut: number;
}

/**
 * Reads a tool request from an untrusted body. Every field is checked here,
 * before it can become a query or an error the model sees.
 */
export function parseAgentToolRequest(value: unknown): AgentToolRequest {
  if (!isRecord(value)) {
    throw new AgentToolError("The tool request is not an object.");
  }

  const tool = value.tool;
  if (typeof tool !== "string" || !isAgentToolName(tool)) {
    throw new AgentToolError(
      `Unknown tool. Use one of: ${AGENT_TOOL_NAMES.join(", ")}.`,
    );
  }

  const raw = value.arguments === undefined ? {} : value.arguments;
  if (!isRecord(raw)) {
    throw new AgentToolError("The tool arguments are not an object.");
  }

  switch (tool) {
    case "analysis_summary":
    case "routes":
      return { tool, arguments: {} };
    case "search_files": {
      const query = stringArgument(raw.query, "query", 200).trim();
      if (query === "") {
        throw new AgentToolError("search_files needs a non-empty query.");
      }
      return {
        tool,
        arguments: {
          query,
          limit: optionalInteger(raw.limit, "limit", 1, MAX_SEARCH, 20),
        },
      };
    }
    case "list_files_by_role": {
      if (typeof raw.role !== "string" || !isRole(raw.role)) {
        throw new AgentToolError(
          `list_files_by_role needs one of: ${ROLE_IDS.join(", ")}.`,
        );
      }
      return {
        tool,
        arguments: {
          role: raw.role,
          limit: optionalInteger(
            raw.limit,
            "limit",
            1,
            MAX_ROLE_FILES,
            MAX_ROLE_FILES,
          ),
        },
      };
    }
    case "file_neighbours":
      return {
        tool,
        arguments: { path: stringArgument(raw.path, "path", 1_000) },
      };
    case "walk": {
      const direction = raw.direction;
      if (direction !== "dependents" && direction !== "dependencies") {
        throw new AgentToolError(
          "walk needs direction to be dependents or dependencies.",
        );
      }
      return {
        tool,
        arguments: {
          path: stringArgument(raw.path, "path", 1_000),
          direction,
          depth: optionalInteger(raw.depth, "depth", 1, 5, 2),
        },
      };
    }
  }
}

/**
 * The six tools, run over the stored map. Every answer is a selection or a
 * walk over the same files and edges the canvas draws; nothing here can
 * create a path or an edge that was not parsed.
 */
export function runAgentTool(
  source: AgentSource,
  request: AgentToolRequest,
): unknown {
  switch (request.tool) {
    case "analysis_summary":
      return summarize(source);
    case "search_files":
      return searchFiles(source.map, request.arguments.query, request.arguments.limit);
    case "list_files_by_role":
      return filesByRole(source.map, request.arguments.role, request.arguments.limit);
    case "file_neighbours":
      return fileNeighbours(source.map, request.arguments.path);
    case "walk":
      return walk(
        source.map,
        request.arguments.path,
        request.arguments.direction,
        request.arguments.depth,
      );
    case "routes":
      return routeTable(source);
  }
}

function summarize(source: AgentSource) {
  const { analysis, map } = source;
  const ranked = rankRepository(map.files);
  const insights = findInsights(map.files, map.edges);
  const coverage = analysis.coverage
    ? coverageSummary(analysis.coverage)
    : null;

  return {
    repository: {
      name: analysis.projectName,
      url: analysis.repositoryUrl,
      framework: analysis.framework ?? "none",
      commit: analysis.commitSha,
    },
    counts: {
      files: map.files.length,
      edges: map.edges.length,
      routes: map.routes.length,
      unclassified: unidentifiedCount(map.files),
    },
    coverage,
    most_depended_on: {
      total: ranked.mostDependedOn.total,
      files: ranked.mostDependedOn.files.map(fileFact),
    },
    unimported: {
      total: ranked.unimported.total,
      files: ranked.unimported.files.map(fileFact),
    },
    heavily_imported: {
      threshold: Number.isFinite(insights.heavilyImported.threshold)
        ? insights.heavilyImported.threshold
        : null,
      total: insights.heavilyImported.files.length,
      files: insights.heavilyImported.files
        .slice(0, 10)
        .map(fileFact),
    },
    cycles: {
      total: insights.cycles.length,
      loops: insights.cycles.slice(0, 5).map((cycle) => ({
        files: cycle.files,
        members: cycle.members,
      })),
    },
    long_files: {
      total: insights.long.length,
      files: insights.long.slice(0, 10).map(fileFact),
    },
  };
}

function searchFiles(map: StoredMap, query: string, limit: number) {
  const needle = query.toLowerCase();
  const matches = map.files
    .filter((file) => file.path.toLowerCase().includes(needle))
    .sort(
      (left, right) =>
        searchScore(right.path, needle) - searchScore(left.path, needle) ||
        left.path.localeCompare(right.path),
    );

  return {
    query,
    total: matches.length,
    files: matches.slice(0, limit).map(fileFact),
    omitted: Math.max(0, matches.length - limit),
  };
}

function searchScore(path: string, needle: string): number {
  const lower = path.toLowerCase();
  if (lower === needle) {
    return 3;
  }
  const name = lower.slice(lower.lastIndexOf("/") + 1);
  return name.includes(needle) ? 2 : 1;
}

function filesByRole(map: StoredMap, role: Role, limit: number) {
  const files = map.files
    .filter((file) => file.role === role)
    .sort(
      (left, right) =>
        right.fanIn - left.fanIn || left.path.localeCompare(right.path),
    );

  return {
    role,
    total: files.length,
    files: files.slice(0, limit).map(fileFact),
    omitted: Math.max(0, files.length - limit),
  };
}

function fileNeighbours(map: StoredMap, path: string) {
  const file = requireFile(map, path);
  const neighbours = neighboursOf(map.edges, path);
  const byPath = new Map(map.files.map((entry) => [entry.path, entry]));

  const withKinds = (rows: typeof neighbours.imports) =>
    rows.map((row) => {
      const neighbour = byPath.get(row.path);
      if (!neighbour) {
        throw new AgentToolError(
          `The map has an edge to ${row.path} but no file there.`,
        );
      }
      return { ...fileFact(neighbour), kinds: row.kinds };
    });

  return {
    path,
    file: fileFact(file),
    imports: withKinds(neighbours.imports),
    imported_by: withKinds(neighbours.importedBy),
  };
}

function walk(
  map: StoredMap,
  path: string,
  direction: Direction,
  depth: number,
) {
  requireFile(map, path);
  const result = reach(adjacency(map.edges), path, direction, depth);
  const byPath = new Map(map.files.map((entry) => [entry.path, entry]));

  const steps = result.steps.map((paths, index) => {
    const shown = paths.slice(0, MAX_STEP_FILES);
    return {
      steps_away: index + 1,
      total: paths.length,
      files: shown.map((entry) => {
        const file = byPath.get(entry);
        if (!file) {
          throw new AgentToolError(
            `The map has an edge to ${entry} but no file there.`,
          );
        }
        return fileFact(file);
      }),
      omitted: Math.max(0, paths.length - shown.length),
    };
  });

  return {
    path,
    direction,
    depth,
    steps,
    beyond: result.beyond,
    total:
      steps.reduce((sum, step) => sum + step.total, 0) + result.beyond,
  };
}

function routeTable(source: AgentSource) {
  const routes = source.map.routes.map((route) => ({
    method: route.method,
    pattern: route.pattern,
    file: route.path,
    line: route.line,
  }));

  return {
    stored: routes.length,
    routes: routes.slice(0, MAX_ROUTES),
    omitted: Math.max(0, routes.length - MAX_ROUTES),
    extraction: source.analysis.coverage?.routes ?? null,
  };
}

function fileFact(file: ParsedFile): AgentFileFact {
  return {
    path: file.path,
    role: file.role,
    lines: file.lines,
    fanIn: file.fanIn,
    fanOut: file.fanOut,
  };
}

function requireFile(map: StoredMap, path: string): ParsedFile {
  const file = map.files.find((entry) => entry.path === path);
  if (!file) {
    throw new AgentToolError(
      `There is no file at ${path} in this analysis.`,
      404,
    );
  }
  return file;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArgument(
  value: unknown,
  name: string,
  max: number,
): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new AgentToolError(`${name} must be a non-empty string.`);
  }
  if (value.length > max) {
    throw new AgentToolError(`${name} must be at most ${max} characters.`);
  }
  return value;
}

function optionalInteger(
  value: unknown,
  name: string,
  min: number,
  max: number,
  fallback: number,
): number {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new AgentToolError(`${name} must be an integer.`);
  }
  if (value < min || value > max) {
    throw new AgentToolError(
      `${name} must be between ${min} and ${max}.`,
    );
  }
  return value;
}
