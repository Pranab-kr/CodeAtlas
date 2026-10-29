"use client";

import { useActionState, useEffect } from "react";

import { rerunAnalysis, type RunState } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";

const INITIAL: RunState = { error: null, analysisId: null };

/**
 * Deliberate, not a side effect of opening a page. The claim is the server's
 * call; if another run owns the row, this says so. On success the page is
 * reloaded rather than redirected through the Flight client.
 */
export function RerunButton({
  analysisId,
  onStart,
}: {
  analysisId: string;
  onStart?: () => void;
}) {
  const [state, action, pending] = useActionState(rerunAnalysis, INITIAL);

  useEffect(() => {
    if (state.analysisId) {
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a full load keeps the Flight client out of the way of live channel updates
      window.location.assign(`/analyses/${state.analysisId}`);
    }
  }, [state.analysisId]);

  return (
    <form
      action={action}
      onSubmit={() => onStart?.()}
      className="flex items-center gap-2"
    >
      <input type="hidden" name="analysisId" value={analysisId} />
      <Button type="submit" variant="outline" size="xs" disabled={pending}>
        {pending ? "Starting…" : "Run again"}
      </Button>
      {state.error ? (
        <span
          role="alert"
          className="font-mono text-[10.5px] text-destructive"
        >
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
