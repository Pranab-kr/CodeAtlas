"use client";

import { GitBranch, Loader2 } from "lucide-react";
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
      <div className="flex h-8 w-[24rem] max-w-full items-center gap-1 rounded-md border border-input bg-card px-1 transition-[border-color,box-shadow] duration-150 focus-within:border-ring focus-within:ring-1 focus-within:ring-ring/40 has-[[aria-invalid=true]]:border-destructive has-[[aria-invalid=true]]:ring-1 has-[[aria-invalid=true]]:ring-destructive/20">
        <GitBranch
          aria-hidden="true"
          className="ml-1 size-3.5 shrink-0 text-muted-foreground"
        />
        <Input
          name="url"
          required
          autoComplete="off"
          spellCheck={false}
          aria-label="Public GitHub repository URL"
          aria-invalid={state.error ? true : undefined}
          placeholder="github.com/owner/repo"
          className="h-7 min-w-0 flex-1 border-0 bg-transparent px-1 font-mono text-[11.5px] shadow-none placeholder:text-muted-foreground/70 focus-visible:ring-0 dark:bg-transparent"
        />
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? (
          <>
            <Loader2 className="animate-spin" />
            Starting
          </>
        ) : (
          "Analyse"
        )}
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
