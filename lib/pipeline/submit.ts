import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import type { Repository } from "./github.ts";

type Db = SupabaseClient<Database>;

export interface Submission {
  analysisId: string;
  /** True when the row is waiting for a run, newly created or not. */
  queued: boolean;
}

/**
 * Find-or-create, enforced by the unique constraints rather than a check
 * followed by an insert, so two tabs submitting the same URL at once still
 * end with one row. A repository is analysed once per organization;
 * submitting it again returns the analysis that already exists.
 */
export async function submitRepository(
  db: Db,
  organizationId: string,
  repository: Repository,
): Promise<Submission> {
  const upserted = await db
    .from("projects")
    .upsert(
      {
        organization_id: organizationId,
        name: repository.label,
        repository_url: repository.url,
      },
      {
        onConflict: "organization_id,repository_url",
        ignoreDuplicates: true,
      },
    )
    .select("id")
    .maybeSingle();

  if (upserted.error) {
    throw new Error(
      `Recording ${repository.label} failed: ${upserted.error.message}`,
    );
  }

  let projectId = upserted.data?.id;
  if (projectId === undefined) {
    const found = await db
      .from("projects")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("repository_url", repository.url)
      .maybeSingle();

    if (found.error) {
      throw new Error(
        `Reading ${repository.label} failed: ${found.error.message}`,
      );
    }
    if (!found.data) {
      throw new Error(
        `Recording ${repository.label} failed: the project row wasn't returned`,
      );
    }
    projectId = found.data.id;
  }

  const inserted = await db
    .from("analyses")
    .upsert(
      { organization_id: organizationId, project_id: projectId },
      { onConflict: "project_id", ignoreDuplicates: true },
    )
    .select("id")
    .maybeSingle();

  if (inserted.error) {
    throw new Error(
      `Starting the analysis failed: ${inserted.error.message}`,
    );
  }

  if (inserted.data) {
    return { analysisId: inserted.data.id, queued: true };
  }

  const existing = await db
    .from("analyses")
    .select("id, status")
    .eq("project_id", projectId)
    .maybeSingle();

  if (existing.error) {
    throw new Error(
      `Reading the existing analysis failed: ${existing.error.message}`,
    );
  }
  if (!existing.data) {
    throw new Error(
      "The analysis row wasn't returned after the insert",
    );
  }

  return {
    analysisId: existing.data.id,
    queued: existing.data.status === "queued",
  };
}
