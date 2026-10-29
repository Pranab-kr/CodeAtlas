import { isTracingEnabled } from "langsmith";
import { getCurrentRunTree } from "langsmith/traceable";

/**
 * Records whether the answer came from the database. The cache read happens
 * inside the traced function, so a hit is a run with this metadata and no LLM
 * child at all — zero tokens, visibly a different shape from a miss.
 */
export function markCache(hit: boolean): void {
  if (!isTracingEnabled()) {
    return;
  }

  try {
    const run = getCurrentRunTree();
    run.extra.metadata = {
      ...(run.extra.metadata ?? {}),
      cache_hit: hit,
    };
    run.tags = [...(run.tags ?? []), hit ? "cache-hit" : "cache-miss"];
  } catch {
    // Tracing was disabled between the check and the call, or this function
    // is not inside a traceable run. Neither may break the model call.
  }
}
