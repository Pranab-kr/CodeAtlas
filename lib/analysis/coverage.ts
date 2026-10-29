import type { RouteCoverage } from "@/lib/parser/types";
import type { Json } from "@/lib/supabase/database.types";

/** The part of the parser's coverage report the map has stored. */
export interface Coverage {
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
  };
  files: {
    parsed: number;
    skipped: number;
  };
  /** Null for an analysis stored before routes were extracted. */
  routes: RouteCoverage | null;
}

export interface CoverageSummary {
  /**
   * Resolved local references as a percentage, floored to one decimal so a
   * run with unresolved references can never display as complete. Null when
   * the repository had no local references to resolve.
   */
  percent: number | null;
  local: number;
  unresolved: number;
  skipped: number;
  partial: boolean;
}

export function readCoverage(value: Json | null): Coverage | null {
  const root = asRecord(value);
  if (!root) {
    return null;
  }

  const imports = asRecord(root.imports);
  const reexports = asRecord(root.reexports);
  const files = asRecord(root.files);
  if (!imports || !reexports || !files) {
    return null;
  }

  const seen = asNumber(imports.seen);
  const resolved = asNumber(imports.resolved);
  const external = asNumber(imports.external);
  const excluded = asNumber(imports.excluded);
  const unresolved = asNumber(imports.unresolved);
  const reexportSeen = asNumber(reexports.seen);
  const reexportResolved = asNumber(reexports.resolved);
  const parsed = asNumber(files.parsed);
  const skipped = asNumber(files.skipped);
  const routes = readRouteCoverage(root.routes);

  if (
    seen === null ||
    resolved === null ||
    external === null ||
    excluded === null ||
    unresolved === null ||
    reexportSeen === null ||
    reexportResolved === null ||
    parsed === null ||
    skipped === null
  ) {
    return null;
  }

  return {
    imports: { seen, resolved, external, excluded, unresolved },
    reexports: { seen: reexportSeen, resolved: reexportResolved },
    files: { parsed, skipped },
    routes,
  };
}

function readRouteCoverage(value: Json | undefined): RouteCoverage | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const listed = asNumber(record.listed);
  const omitted = asNumber(record.omitted);
  const withheld = record.withheld;
  if (listed === null || omitted === null) {
    return null;
  }
  if (withheld !== undefined && withheld !== null && typeof withheld !== "string") {
    return null;
  }

  return { listed, omitted, withheld: withheld ?? null };
}

export function coverageSummary(coverage: Coverage): CoverageSummary {
  // A re-export gap is a missing edge as much as an unresolved import is, so
  // both are in the denominator.
  const reexportGaps = Math.max(
    0,
    coverage.reexports.seen - coverage.reexports.resolved,
  );
  const resolved = coverage.imports.resolved + coverage.reexports.resolved;
  const unresolved = coverage.imports.unresolved + reexportGaps;
  const local = resolved + unresolved;
  // Floor rather than round: 99.96% must not become 100.0%.
  const percent =
    local === 0 ? null : Math.floor((resolved / local) * 1000) / 10;

  return {
    percent,
    local,
    unresolved,
    skipped: coverage.files.skipped,
    partial: (percent !== null && percent < 100) || coverage.files.skipped > 0,
  };
}

function asRecord(
  value: Json | undefined,
): { [key: string]: Json | undefined } | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value;
}

function asNumber(value: Json | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
