"use client";

import { useEffect, useState } from "react";

import {
  isStage,
  isStatus,
  isUnfinished,
  parseProgress,
  progressTopic,
  sameProgress,
  type Progress,
} from "@/lib/pipeline/stages";
import { useBrowserSupabase } from "@/lib/supabase/browser";

/**
 * Follows one analysis's channel while it's unfinished. Starts from what the
 * server rendered; after joining, reads the row once, because a stage that
 * moved between the render and the join was published to nobody. After that,
 * only the channel, never a poll.
 *
 * Transitioning to a finished run is the page's decision: the caller reloads
 * or the server renders the result. Nothing here navigates.
 */
export function useAnalysisProgress(
  analysisId: string,
  initial: Progress,
  enabled = true,
) {
  const supabase = useBrowserSupabase();
  const [progress, setProgress] = useState<Progress>(initial);
  const [lost, setLost] = useState<string | null>(null);
  const following = enabled && isUnfinished(progress.status);

  useEffect(() => {
    if (!supabase || !following) {
      return;
    }

    let cancelled = false;
    const channel = supabase
      .channel(progressTopic(analysisId), { config: { private: true } })
      .on("broadcast", { event: "progress" }, ({ payload }) => {
        const next = parseProgress(payload);
        if (next && !cancelled) {
          setProgress(next);
        }
      })
      .subscribe(async (state, error) => {
        if (cancelled) {
          return;
        }

        if (state === "SUBSCRIBED") {
          setLost(null);
          const { data } = await supabase
            .from("analyses")
            .select("status, stage, stage_message, error")
            .eq("id", analysisId)
            .maybeSingle();

          if (!data || cancelled) {
            return;
          }

          const read = progressFromRow(data);
          if (read) {
            // Same content keeps the same object, so "unchanged since render"
            // stays true for the stale check.
            setProgress((current) =>
              sameProgress(current, read) ? current : read,
            );
          }
        } else if (state === "CHANNEL_ERROR" || state === "TIMED_OUT") {
          // Said out loud: a page that silently stops updating looks stuck.
          setLost(error?.message ?? state.toLowerCase());
        }
      });

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [supabase, analysisId, following]);

  // The caller decides what a finished transition means, and can pause the
  // channel while it deliberately starts another run.
  return { progress, lost };
}

function progressFromRow(row: {
  status: string;
  stage: string | null;
  stage_message: string | null;
  error: string | null;
}): Progress | null {
  if (!isStatus(row.status)) {
    return null;
  }
  if (row.stage !== null && !isStage(row.stage)) {
    return null;
  }
  return {
    status: row.status,
    stage: row.stage,
    message: row.status === "failed" ? row.error : row.stage_message,
  };
}
