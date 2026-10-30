import { isTracingEnabled } from "langsmith";
import type { RunTree } from "langsmith/run_trees";
import { getCurrentRunTree } from "langsmith/traceable";

const projectIds = new Map<string, string>();

/**
 * Records whether the answer came from the database. The cache read happens
 * inside the traced function, so a hit is a run with this metadata and no LLM
 * child at all — zero tokens, visibly a different shape from a miss.
 */
export function markCache(hit: boolean): void {
  updateRun("cache_hit", hit, hit ? "cache-hit" : "cache-miss");
}

/**
 * Records the exact set of paths the prompt handed the model. The invented-
 * path check reads this later, and so does the command-line report over recent
 * traces.
 */
export function markAllowedPaths(paths: readonly string[]): void {
  updateRun("allowed_paths", paths, "paths-recorded");
}

/**
 * The live invented-path evaluator. It scores the explanation that was just
 * generated, on the run the generation belongs to, and writes the failures to
 * the run so a report can confirm them without another model call.
 *
 * A cached answer is not scored: it was scored when it was generated, and the
 * same body arriving twice would double-count it.
 */
export async function recordInventedPaths(
  failures: readonly string[],
  allowedCount: number,
): Promise<void> {
  const run = updateRun(
    "invented_paths",
    failures,
    failures.length === 0 ? "invented-paths-clean" : "invented-paths-found",
  );
  if (run === null) {
    return;
  }

  const score = failures.length === 0 ? 1 : 0;
  const shown = failures.slice(0, 20);
  const comment =
    failures.length === 0
      ? `All named paths were in the ${allowedCount}-path context.`
      : `Not in the ${allowedCount}-path context: ${shown.join(", ")}${
          failures.length > shown.length
            ? ` (+${failures.length - shown.length} more)`
            : ""
        }`;

  try {
    run.extra.metadata = {
      ...(run.extra.metadata ?? {}),
      invented_path_score: score,
    };

    if (!run.project_name) {
      return;
    }

    await run.client.createFeedback({
      runId: run.id,
      sessionId: await projectId(run),
      key: "invented_paths",
      score,
      comment,
      sourceInfo: {
        evaluator: "invented-paths-v1",
        allowed_paths: allowedCount,
      },
    });
  } catch (error) {
    // A failed score must never turn a working explanation into an error.
    console.error(
      "Recording the invented-path score failed:",
      error instanceof Error ? error.message : String(error),
    );
  }
}

function updateRun(
  key: string,
  value: unknown,
  tag: string,
): RunTree | null {
  if (!isTracingEnabled()) {
    return null;
  }

  try {
    const run = getCurrentRunTree(true);
    if (!run) {
      return null;
    }
    run.extra.metadata = {
      ...(run.extra.metadata ?? {}),
      [key]: value,
    };
    run.tags = [...(run.tags ?? []), tag];
    return run;
  } catch {
    // Tracing was disabled between the check and the call, or this function
    // is not inside a traceable run. Neither may break the model call.
    return null;
  }
}

async function projectId(run: RunTree): Promise<string> {
  const name = run.project_name;
  if (!name) {
    throw new Error("The run has no project name");
  }

  const known = projectIds.get(name);
  if (known !== undefined) {
    return known;
  }

  const project = await run.client.readProject({ projectName: name });
  projectIds.set(name, project.id);
  return project.id;
}
