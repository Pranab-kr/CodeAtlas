"use client";

import { useActionState, useEffect } from "react";

import { submitAnalysis, type RunState } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const INITIAL: RunState = { error: null, analysisId: null };

export function SubmitForm() {
  const [state, action, pending] = useActionState(submitAnalysis, INITIAL);

  // A full document load, deliberately: a client-side redirect during a live
  // progress update breaks the Flight client in Next 16. The submit action
  // reports the analysis; the navigation happens here.
  useEffect(() => {
    if (state.analysisId) {
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a full load keeps the Flight client out of the way of live channel updates
      window.location.assign(`/analyses/${state.analysisId}`);
    }
  }, [state.analysisId]);

  return (
    <form action={action} className="mt-4 flex flex-wrap items-center gap-2">
      <Input
        name="url"
        required
        autoComplete="off"
        spellCheck={false}
        aria-label="Public GitHub repository URL"
        aria-invalid={state.error ? true : undefined}
        placeholder="github.com/owner/repo"
        className="h-7 w-80 max-w-full font-mono text-[11.5px]"
      />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Starting…" : "Analyse"}
      </Button>
      {state.error ? (
        <p
          role="alert"
          className="w-full font-mono text-[10.5px] text-destructive"
        >
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
