"use server";

import { auth } from "@clerk/nextjs/server";
import { after } from "next/server";

import {
  parseRepositoryUrl,
  PipelineError,
  type Repository,
} from "@/lib/pipeline/github";
import {
  AlreadyRunningError,
  claimAnalysis,
  runAnalysis,
  type ClaimedRun,
} from "@/lib/pipeline/run";
import { submitRepository } from "@/lib/pipeline/submit";
import { createPipelineSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * The client navigates on the returned id with a full page load. A redirect()
 * from here would hand the same trip to the Flight client, and a live progress
 * update landing during that stream corrupts it (Next 16, Turbopack). The
 * navigation decision stays on the client; this action only reports where.
 */
export interface RunState {
  error: string | null;
  analysisId: string | null;
}

const NOT_STARTED: RunState = { error: null, analysisId: null };

export async function submitAnalysis(
  _previous: RunState,
  form: FormData,
): Promise<RunState> {
  const { orgId } = await auth();
  if (!orgId) {
    return { ...NOT_STARTED, error: "No active organization" };
  }

  const value = form.get("url");
  if (typeof value !== "string" || value.trim() === "") {
    return { ...NOT_STARTED, error: "Paste a GitHub repository URL" };
  }

  let repository: Repository;
  try {
    repository = parseRepositoryUrl(value);
  } catch (error) {
    return { ...NOT_STARTED, error: messageOf(error) };
  }

  const db = createPipelineSupabaseClient();
  let analysisId: string;

  try {
    const submission = await submitRepository(db, orgId, repository);
    analysisId = submission.analysisId;

    // Submitting an analysed repository takes you to it. A queued row has no
    // run working on it, so claim it even when this submission found it.
    // Starting another run over a finished analysis stays a deliberate act
    // from that analysis, not a side effect of the URL.
    if (submission.queued) {
      const claimed = await claimAnalysis(db, {
        analysisId,
        organizationId: orgId,
        repository,
      });
      start(claimed);
    }
  } catch (error) {
    return { ...NOT_STARTED, error: messageOf(error) };
  }

  return { error: null, analysisId };
}

export async function rerunAnalysis(
  _previous: RunState,
  form: FormData,
): Promise<RunState> {
  const value = form.get("analysisId");
  if (typeof value !== "string" || value === "") {
    return { ...NOT_STARTED, error: "No analysis to run" };
  }

  // Visibility is the policy's call. Only after the row is readable does the
  // writer get an id to claim.
  const supabase = await createServerSupabaseClient();
  const { data: analysis, error } = await supabase
    .from("analyses")
    .select("id, organization_id, project_id")
    .eq("id", value)
    .maybeSingle();

  if (error) {
    return {
      ...NOT_STARTED,
      error: `Reading the analysis failed: ${error.message}`,
    };
  }
  if (!analysis) {
    return {
      ...NOT_STARTED,
      error: "That analysis isn't available in this workspace",
    };
  }

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("repository_url")
    .eq("id", analysis.project_id)
    .maybeSingle();

  if (projectError) {
    return {
      ...NOT_STARTED,
      error: `Reading the repository failed: ${projectError.message}`,
    };
  }
  if (!project) {
    return {
      ...NOT_STARTED,
      error: "That analysis has no repository to fetch",
    };
  }

  let repository: Repository;
  try {
    repository = parseRepositoryUrl(project.repository_url);
  } catch (error) {
    return { ...NOT_STARTED, error: messageOf(error) };
  }

  const db = createPipelineSupabaseClient();
  try {
    const claimed = await claimAnalysis(db, {
      analysisId: analysis.id,
      organizationId: analysis.organization_id,
      repository,
    });
    start(claimed);
  } catch (error) {
    if (error instanceof AlreadyRunningError) {
      return { ...NOT_STARTED, error: error.message };
    }
    return { ...NOT_STARTED, error: messageOf(error) };
  }

  return { error: null, analysisId: analysis.id };
}

/**
 * The run outlives the response. It records its own failure on the row; this
 * only makes sure nothing is lost if even that fails.
 */
function start(claimed: ClaimedRun): void {
  after(async () => {
    try {
      await runAnalysis(createPipelineSupabaseClient(), claimed);
    } catch (error) {
      console.error(`Analysis ${claimed.analysisId} failed:`, error);
    }
  });
}

function messageOf(error: unknown): string {
  if (error instanceof PipelineError) {
    return error.message;
  }
  return error instanceof Error ? error.message : String(error);
}
