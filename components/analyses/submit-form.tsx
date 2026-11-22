"use client";

import { ArrowRight, GitBranch, Loader2 } from "lucide-react";
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
    <form action={action} className="w-full sm:w-auto">
      <div className="flex w-full items-center gap-1 rounded-xl border border-hairline-strong bg-raised p-1 shadow-xs transition-[border-color,box-shadow] duration-150 focus-within:border-foreground/30 focus-within:ring-2 focus-within:ring-ring/15 has-[[aria-invalid=true]]:border-destructive has-[[aria-invalid=true]]:ring-2 has-[[aria-invalid=true]]:ring-destructive/20 sm:w-[27rem]">
        <GitBranch
          aria-hidden="true"
          className="ml-2 size-3.5 shrink-0 text-muted-foreground"
        />
        <Input
          name="url"
          required
          autoComplete="off"
          spellCheck={false}
          aria-label="Public GitHub repository URL"
          aria-invalid={state.error ? true : undefined}
          placeholder="github.com/owner/repo"
          className="h-8 min-w-0 flex-1 border-0 bg-transparent px-1.5 font-mono text-[12.5px] shadow-none placeholder:text-muted-foreground/65 focus-visible:bg-transparent focus-visible:ring-0"
        />
        <Button
          type="submit"
          size="sm"
          className="group/submit h-8 shrink-0 gap-1.5 rounded-lg px-3"
          disabled={pending}
        >
          {pending ? (
            <>
              <Loader2 className="animate-spin" />
              Starting
            </>
          ) : (
            <>
              Analyse
              <ArrowRight className="size-3.5 transition-transform duration-150 group-hover/submit:translate-x-0.5" />
            </>
          )}
        </Button>
      </div>
      {state.error ? (
        <p
          role="alert"
          className="mt-1.5 font-mono text-[11px] text-destructive"
        >
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
