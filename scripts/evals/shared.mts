import type { SupabaseClient } from "@supabase/supabase-js";

import { parseRepositoryUrl, type Repository } from "../../lib/pipeline/github.ts";
import { createPipelineSupabaseClient } from "../../lib/supabase/admin.ts";
import type { Database } from "../../lib/supabase/database.types.ts";

type Db = SupabaseClient<Database>;

export interface AnalysisTarget {
  id: string;
  projectId: string;
  projectName: string;
  repository: Repository;
  commitSha: string;
  framework: string | null;
}

/** Analyses whose commit is known, paired with the repository they came from. */
export async function readAnalysisTargets(db: Db): Promise<AnalysisTarget[]> {
  const { data: analyses, error } = await db
    .from("analyses")
    .select("id, project_id, commit_sha, framework")
    .eq("status", "succeeded")
    .not("commit_sha", "is", null)
    .order("id")
    .limit(100);

  if (error) {
    throw new Error(`Reading analyses failed: ${error.message}`);
  }

  const projectIds = [...new Set(analyses.map((analysis) => analysis.project_id))];
  if (projectIds.length === 0) {
    return [];
  }

  const { data: projects, error: projectError } = await db
    .from("projects")
    .select("id, name, repository_url")
    .in("id", projectIds);

  if (projectError) {
    throw new Error(`Reading repositories failed: ${projectError.message}`);
  }

  const projectsById = new Map(projects.map((project) => [project.id, project]));
  const targets: AnalysisTarget[] = [];

  for (const analysis of analyses) {
    const project = projectsById.get(analysis.project_id);
    if (!project || analysis.commit_sha === null) {
      continue;
    }

    let repository: Repository;
    try {
      repository = parseRepositoryUrl(project.repository_url);
    } catch (error) {
      console.error(
        `Skipping ${project.repository_url}: ${messageOf(error)}`,
      );
      continue;
    }

    targets.push({
      id: analysis.id,
      projectId: project.id,
      projectName: project.name,
      repository,
      commitSha: analysis.commit_sha,
      framework: analysis.framework,
    });
  }

  return targets;
}

export function evalDb(): Db {
  return createPipelineSupabaseClient();
}

/**
 * Runs `work` over `items` with a small concurrency limit. GitHub's raw host
 * handles a handful of parallel requests; forty at once invites throttling.
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  work: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) {
        return;
      }
      results[index] = await work(items[index] as T, index);
    }
  }

  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
