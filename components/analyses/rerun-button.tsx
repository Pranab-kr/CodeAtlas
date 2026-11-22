"use client";

import { Loader2, RotateCw } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";

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
  onError,
}: {
  analysisId: string;
  onStart?: () => void;
  onError?: () => void;
}) {
  const [state, action, pending] = useActionState(rerunAnalysis, INITIAL);

  useEffect(() => {
    if (state.analysisId) {
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a full load keeps the Flight client out of the way of live channel updates
      window.location.assign(`/analyses/${state.analysisId}`);
    }
  }, [state.analysisId]);

  // A refused rerun must not leave live progress switched off. The action
  // returns a fresh state object for every result, including an identical
  // error, so comparing identity catches a repeat attempt too.
  const lastState = useRef(state);
  useEffect(() => {
    if (state !== lastState.current) {
      lastState.current = state;
      if (state.error) {
        onError?.();
      }
    }
  }, [state, onError]);

  return (
    <form
      action={action}
      onSubmit={() => onStart?.()}
      className="flex items-center gap-2"
    >
      <input type="hidden" name="analysisId" value={analysisId} />
      <Button type="submit" variant="outline" size="xs" disabled={pending}>
        {pending ? (
          <>
            <Loader2 className="animate-spin" />
            Starting…
          </>
        ) : (
          <>
            <RotateCw className="size-3" />
            Run again
          </>
        )}
      </Button>
      {state.error ? (
        <span
          role="alert"
          className="font-mono text-[11px] text-destructive"
        >
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
