/**
 * The parser output contract. Everything after phase 3 reads this shape, so
 * changes here are changes to a contract, not refactors.
 */

export type EdgeKind = "import" | "reexport" | "dynamic" | "require";

export interface ParsedFile {
  path: string;
  folder: string;
  lines: number;
  contentHash: string;
  role: string | null;
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
}

export interface ParseResult {
  framework: string;
  files: ParsedFile[];
  edges: ParsedEdge[];
  skipped: SkippedFile[];
  coverage: ImportCoverage;
}
