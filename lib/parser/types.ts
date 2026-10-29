/**
 * The parser output contract. Everything after phase 3 reads this shape, so
 * changes here are changes to a contract, not refactors.
 */

import type { Role } from "../roles.ts";

export type EdgeKind = "import" | "reexport" | "dynamic" | "require";

export const ROUTE_METHODS = [
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "DELETE",
  "PATCH",
  "OPTIONS",
] as const;

export type RouteMethod = (typeof ROUTE_METHODS)[number];

export function isRouteMethod(value: string): value is RouteMethod {
  return ROUTE_METHODS.some((method) => method === value);
}

/** A route the syntax states exactly: the method and the full pattern. */
export interface ParsedRoute {
  /** The file declaring it, repo-relative. */
  path: string;
  method: RouteMethod;
  pattern: string;
  line: number;
}

export interface ParsedFile {
  path: string;
  folder: string;
  lines: number;
  contentHash: string;
  role: Role | null;
  fanIn: number;
  fanOut: number;
}

export interface ParsedEdge {
  source: string;
  target: string;
  kind: EdgeKind;
  specifier: string;
  line: number;
}

export interface SkippedFile {
  path: string;
  reason: string;
}

export type ImportOutcome = "resolved" | "external" | "excluded" | "unresolved";

export interface UnresolvedImport {
  importer: string;
  specifier: string;
  kind: EdgeKind;
  line: number;
  reason: string;
  tried: string[];
}

export interface ExcludedImport {
  importer: string;
  specifier: string;
  kind: EdgeKind;
  line: number;
  target: string;
  reason: string;
}

export interface ReexportGap {
  importer: string;
  specifier: string;
  line: number;
  outcome: Exclude<ImportOutcome, "resolved">;
  reason: string;
}

/** What an adapter had to leave out of the route table, and why. */
export interface RouteCoverage {
  listed: number;
  /** Declarations whose method or full pattern isn't written in the syntax. */
  omitted: number;
  /** Set when something project-wide made every pattern uncertain. */
  withheld: string | null;
}

export interface ImportCoverage {
  imports: {
    seen: number;
    resolved: number;
    external: number;
    excluded: number;
    unresolved: number;
  };
  reexports: {
    seen: number;
    resolved: number;
    gaps: ReexportGap[];
  };
  unresolved: UnresolvedImport[];
  excluded: ExcludedImport[];
  routes: RouteCoverage;
}

export interface ParseResult {
  framework: string;
  files: ParsedFile[];
  edges: ParsedEdge[];
  routes: ParsedRoute[];
  skipped: SkippedFile[];
  coverage: ImportCoverage;
}
