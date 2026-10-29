import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";

import { parseRepository } from "@/lib/parser/parse";
import type { ParseResult } from "@/lib/parser/types";
import { walkRepository } from "@/lib/parser/walk";
import type { Database, Json } from "@/lib/supabase/database.types";

import {
  downloadArchive,
  resolveHeadCommit,
  type Repository,
} from "./github.ts";
import { STALE_AFTER_MS, type Stage } from "./stages.ts";
import { storeResult } from "./store.ts";

type Db = SupabaseClient<Database>;

export class AlreadyRunningError extends Error {
  override name = "AlreadyRunningError";
}

export class SupersededError extends Error {
  override name = "SupersededError";
}

export interface ClaimedRun {
  analysisId: string;
  organizationId: string;
  repository: Repository;
  /** Every later write is scoped to this, so a taken-over run can't clobber. */
  claimedStartedAt: string;
}

/**
 * Claim first, so the redirect target already says "running". A run that
 * stopped without failing is claimable once it's stale; a live one is not.
 */
export async function claimAnalysis(
  db: Db,
  input: {
    analysisId: string;
    organizationId: string;
    repository: Repository;
  },
): Promise<ClaimedRun> {
  const startedAt = new Date().toISOString();
  const staleBefore = new Date(Date.now() - STALE_AFTER_MS).toISOString();

  const { data, error } = await db
    .from("analyses")
    .update({
      status: "running",
      stage: "fetch",
      stage_message: "Starting",
      started_at: startedAt,
      updated_at: startedAt,
      finished_at: null,
      error: null,
      coverage: null,
      commit_sha: null,
      framework: null,
    })
    .eq("id", input.analysisId)
    .eq("organization_id", input.organizationId)
    .or(`status.neq.running,updated_at.lt.${staleBefore}`)
    .select("id");

  if (error) {
    throw new Error(
      `Starting analysis ${input.analysisId} failed: ${error.message}`,
    );
  }

  if (data.length === 0) {
    throw new AlreadyRunningError(
      "This analysis is already running. Wait for it to finish, or for the run to be marked stale.",
    );
  }

  return { ...input, claimedStartedAt: startedAt };
}

export async function runAnalysis(
  db: Db,
  claimed: ClaimedRun,
): Promise<void> {
  await continueRun(db, claimed);
}

/**
 * Fetch, select, parse, store. Each stage is a single-row update, which the
 * trigger on analyses publishes to the analysis's channel. The catch writes a
 * failed state rather than leaving the row mid-parse; the stage stays where
 * the run stopped, so the row says where it failed.
 */
export async function continueRun(
  db: Db,
  claimed: ClaimedRun,
): Promise<void> {
  const { analysisId, organizationId, repository } = claimed;
  let workdir: string | null = null;

  try {
    workdir = await mkdtemp(path.join(tmpdir(), "codeatlas-"));

    await enter(
      db,
      claimed,
      "fetch",
      `Resolving ${repository.label}'s latest commit`,
    );
    const sha = await resolveHeadCommit(repository);
    await update(db, claimed, {
      commit_sha: sha,
      stage_message: `Downloading ${repository.label} at ${sha.slice(0, 7)}`,
    });
    await downloadArchive(repository, sha, workdir);

    await enter(
      db,
      claimed,
      "select",
      "Walking the repository for TypeScript and JavaScript files",
    );
    const selection = walkRepository(workdir);
    await update(db, claimed, {
      stage_message:
        `Found ${count(selection.files.length, "source file")}` +
        (selection.skipped.length > 0
          ? `, ${selection.skipped.length} skipped`
          : ""),
    });

    await enter(
      db,
      claimed,
      "parse",
      `Parsing ${count(selection.files.length, "file")}`,
    );
    const result = parseRepository(workdir);

    await enter(
      db,
      claimed,
      "store",
      `Storing ${count(result.files.length, "file")} and ${count(
        result.edges.length,
        "edge",
      )}`,
    );
    await storeResult(
      db,
      { id: analysisId, organizationId },
      result,
    );

    await update(db, claimed, {
      status: "succeeded",
      finished_at: new Date().toISOString(),
      framework: result.framework,
      coverage: storedCoverage(result),
      stage_message: `Mapped ${count(result.files.length, "file")} and ${count(
        result.edges.length,
        "edge",
      )}`,
    });
  } catch (error) {
    // A newer run owns the row now; its outcome is the one to record.
    if (error instanceof SupersededError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    const finishedAt = new Date().toISOString();
    const failed = await db
      .from("analyses")
      .update({
        status: "failed",
        error: message,
        finished_at: finishedAt,
        updated_at: finishedAt,
      })
      .eq("id", analysisId)
      .eq("started_at", claimed.claimedStartedAt);

    if (failed.error) {
      throw new Error(
        `Run failed (${message}), and recording the failure failed too: ${failed.error.message}`,
        { cause: error },
      );
    }

    throw error;
  } finally {
    if (workdir) {
      await rm(workdir, { recursive: true, force: true });
    }
  }
}

async function enter(
  db: Db,
  claimed: ClaimedRun,
  stage: Stage,
  message: string,
): Promise<void> {
  await update(db, claimed, { stage, stage_message: message });
}

async function update(
  db: Db,
  claimed: ClaimedRun,
  values: Database["public"]["Tables"]["analyses"]["Update"],
): Promise<void> {
  const { data, error } = await db
    .from("analyses")
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq("id", claimed.analysisId)
    .eq("started_at", claimed.claimedStartedAt)
    .select("id");

  if (error) {
    throw new Error(
      `Updating analysis ${claimed.analysisId} failed: ${error.message}`,
    );
  }

  if (data.length === 0) {
    throw new SupersededError(
      `Analysis ${claimed.analysisId} was taken over by a newer run`,
    );
  }
}

/**
 * What the map's coverage banner needs, and no more. The detailed unresolved
 * and excluded lists stay out of the row and out of the browser.
 */
function storedCoverage(result: ParseResult): Json {
  return {
    imports: {
      seen: result.coverage.imports.seen,
      resolved: result.coverage.imports.resolved,
      external: result.coverage.imports.external,
      excluded: result.coverage.imports.excluded,
      unresolved: result.coverage.imports.unresolved,
    },
    reexports: {
      seen: result.coverage.reexports.seen,
      resolved: result.coverage.reexports.resolved,
    },
    files: {
      parsed: result.files.length,
      skipped: result.skipped.length,
    },
    routes: {
      listed: result.coverage.routes.listed,
      omitted: result.coverage.routes.omitted,
      withheld: result.coverage.routes.withheld,
    },
  };
}

function count(value: number, noun: string): string {
  return `${value} ${noun}${value === 1 ? "" : "s"}`;
}
