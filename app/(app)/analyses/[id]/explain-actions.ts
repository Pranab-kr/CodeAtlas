"use server";

import { auth } from "@clerk/nextjs/server";

import {
  AiNotConfiguredError,
} from "@/lib/ai/client";
import { loadFileContext, loadFolderContext } from "@/lib/ai/context";
import { explainFile, explainFolder } from "@/lib/ai/explanations";
import {
  fetchFileAt,
  SourceNotFoundError,
} from "@/lib/ai/source";
import type {
  ExplainActionResult,
  ExplainTargetInput,
  StaleInfo,
} from "@/lib/ai/types";
import { env } from "@/lib/env";
import {
  parseRepositoryUrl,
  PipelineError,
  resolveHeadCommit,
  type Repository,
} from "@/lib/pipeline/github";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TARGET_LENGTH = 4_096;

interface ExplainInput {
  analysisId: string;
  target: ExplainTargetInput;
}

interface LoadedAnalysis {
  db: Awaited<ReturnType<typeof createServerSupabaseClient>>;
  analysisId: string;
  organizationId: string;
  commitSha: string;
  projectName: string;
  repository: Repository;
}

export async function explainAction(
  input: ExplainInput,
): Promise<ExplainActionResult> {
  const parsed = parseInput(input);
  if (!parsed) {
    return { ok: false, error: "The explanation request is not valid." };
  }

  const { orgId } = await auth();
  if (!orgId) {
    return { ok: false, error: "No active organization" };
  }
  if (!env.aiConfigured) {
    return {
      ok: false,
      error:
        "AI is not configured. Set AI_BASE_URL, AI_API_KEY and AI_MODEL in .env.local.",
    };
  }

  try {
    const loaded = await loadAnalysis(parsed.analysisId);

    if (parsed.target.kind === "file") {
      const file = await loadFileContext(
        loaded.db,
        loaded.analysisId,
        parsed.target.path,
      );
      const explanation = await explainFile({
        db: loaded.db,
        analysisId: loaded.analysisId,
        organizationId: loaded.organizationId,
        file,
        repository: loaded.repository,
        commitSha: loaded.commitSha,
      });
      return { ok: true, ...explanation };
    }

    const folder = await loadFolderContext(
      loaded.db,
      loaded.analysisId,
      parsed.target.id,
      loaded.projectName,
    );
    const explanation = await explainFolder({
      db: loaded.db,
      analysisId: loaded.analysisId,
      organizationId: loaded.organizationId,
      folder,
    });
    return { ok: true, ...explanation };
  } catch (error) {
    if (!(error instanceof AiNotConfiguredError)) {
      console.error("Explaining failed:", error);
    }
    return { ok: false, error: messageOf(error) };
  }
}

/**
 * Runs separately from the explanation so a cache hit never waits on GitHub,
 * and a rate-limited check can't stop an answer from rendering.
 */
export async function stalenessAction(
  input: ExplainInput,
): Promise<StaleInfo | null> {
  const parsed = parseInput(input);
  if (!parsed) {
    return { kind: "unknown", message: "The request is not valid." };
  }

  const { orgId } = await auth();
  if (!orgId) {
    return { kind: "unknown", message: "No active organization" };
  }

  try {
    const loaded = await loadAnalysis(parsed.analysisId);
    const headSha = await resolveHeadCommit(loaded.repository);

    if (headSha === loaded.commitSha) {
      return null;
    }

    if (parsed.target.kind === "folder") {
      return {
        kind: "repository-moved",
        analysedSha: loaded.commitSha,
        headSha,
      };
    }

    const { data: file, error } = await loaded.db
      .from("files")
      .select("content_hash")
      .eq("analysis_id", loaded.analysisId)
      .eq("path", parsed.target.path)
      .maybeSingle();

    if (error) {
      throw new Error(`Reading ${parsed.target.path} failed: ${error.message}`);
    }
    if (!file) {
      throw new Error(
        `This analysis has no file at ${parsed.target.path}.`,
      );
    }

    try {
      const fetched = await fetchFileAt(
        loaded.repository,
        headSha,
        parsed.target.path,
      );
      return fetched.hash === file.content_hash
        ? {
            kind: "repository-moved",
            analysedSha: loaded.commitSha,
            headSha,
          }
        : {
            kind: "file-changed",
            analysedSha: loaded.commitSha,
            headSha,
          };
    } catch (error) {
      if (error instanceof SourceNotFoundError) {
        return {
          kind: "file-changed",
          analysedSha: loaded.commitSha,
          headSha,
        };
      }
      return { kind: "unknown", message: messageOf(error) };
    }
  } catch (error) {
    if (!(error instanceof PipelineError)) {
      console.error("Checking staleness failed:", error);
    }
    return { kind: "unknown", message: messageOf(error) };
  }
}

async function loadAnalysis(analysisId: string): Promise<LoadedAnalysis> {
  const db = await createServerSupabaseClient();

  const { data: analysis, error } = await db
    .from("analyses")
    .select("id, organization_id, project_id, status, commit_sha")
    .eq("id", analysisId)
    .maybeSingle();

  if (error) {
    throw new Error(`Reading the analysis failed: ${error.message}`);
  }
  if (!analysis) {
    throw new Error("That analysis isn't available in this workspace.");
  }
  if (analysis.status !== "succeeded") {
    throw new Error("That analysis hasn't finished yet.");
  }

  const commitSha = analysis.commit_sha;
  if (!commitSha) {
    throw new Error("That analysis has no commit recorded.");
  }

  const { data: project, error: projectError } = await db
    .from("projects")
    .select("name, repository_url")
    .eq("id", analysis.project_id)
    .maybeSingle();

  if (projectError) {
    throw new Error(
      `Reading the repository failed: ${projectError.message}`,
    );
  }
  if (!project) {
    throw new Error("That analysis has no repository to explain.");
  }

  return {
    db,
    analysisId: analysis.id,
    organizationId: analysis.organization_id,
    commitSha,
    projectName: project.name,
    repository: parseRepositoryUrl(project.repository_url),
  };
}

function parseInput(input: ExplainInput): ExplainInput | null {
  if (typeof input !== "object" || input === null) {
    return null;
  }
  if (
    typeof input.analysisId !== "string" ||
    !UUID.test(input.analysisId)
  ) {
    return null;
  }

  const target = input.target;
  if (typeof target !== "object" || target === null) {
    return null;
  }

  if (target.kind === "file") {
    if (
      typeof target.path !== "string" ||
      target.path === "" ||
      target.path.length > MAX_TARGET_LENGTH
    ) {
      return null;
    }
    return {
      analysisId: input.analysisId,
      target: { kind: "file", path: target.path },
    };
  }

  if (target.kind === "folder") {
    if (
      typeof target.id !== "string" ||
      target.id === "" ||
      target.id.length > MAX_TARGET_LENGTH
    ) {
      return null;
    }
    return {
      analysisId: input.analysisId,
      target: { kind: "folder", id: target.id },
    };
  }

  return null;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
