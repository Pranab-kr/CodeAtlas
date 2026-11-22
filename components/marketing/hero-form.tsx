"use client";

import { ArrowRight, GitBranch, Loader2 } from "lucide-react";
import { useActionState, useEffect } from "react";

import {
  startFromLanding,
  type LandingState,
} from "@/app/landing-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const INITIAL: LandingState = { error: null, next: null };

/**
 * The field is the product, not a link to it: the URL is validated by the same
 * server action the dashboard uses, and a signed-out visitor is sent through
 * sign-in with the analysis as the return address.
 */
export function HeroForm({
  id = "repository-url",
  buttonLabel = "Analyse repository",
  compact = false,
}: {
  id?: string;
  buttonLabel?: string;
  compact?: boolean;
}) {
  const [state, action, pending] = useActionState(startFromLanding, INITIAL);

  useEffect(() => {
    if (state.next) {
      window.location.assign(state.next);
    }
  }, [state.next]);

  return (
    <form
      action={action}
      className={cn("w-full max-w-[34rem]", compact ? "mt-0" : "mt-7")}
    >
      <label htmlFor={id} className="sr-only">
        Public GitHub repository URL
      </label>
      <div
        className={cn(
          "group flex items-center gap-1.5 rounded-xl border border-hairline-strong bg-raised p-1.5 shadow-sm transition-[border-color,box-shadow] duration-150",
          "focus-within:border-foreground/30 focus-within:ring-2 focus-within:ring-ring/15",
          "has-[[aria-invalid=true]]:border-destructive has-[[aria-invalid=true]]:ring-2 has-[[aria-invalid=true]]:ring-destructive/20",
        )}
      >
        <span
          aria-hidden="true"
          className="hidden pl-2.5 text-muted-foreground sm:block"
        >
          <GitBranch className="size-3.5" />
        </span>
        <Input
          id={id}
          name="url"
          required
          autoComplete="off"
          spellCheck={false}
          aria-invalid={state.error ? true : undefined}
          placeholder="github.com/owner/repo"
          className={cn(
            "min-w-0 flex-1 border-0 bg-transparent px-2 font-mono text-[13px] shadow-none placeholder:text-muted-foreground/65 focus-visible:bg-transparent focus-visible:ring-0",
            compact ? "h-8 text-[12.5px]" : "h-9",
          )}
        />
        <Button
          type="submit"
          size="lg"
          className={cn(
            "group/submit shrink-0 gap-1.5 rounded-lg px-3.5",
            compact ? "h-8 text-[12px]" : "h-9 text-[12.5px]",
          )}
          disabled={pending}
        >
          {pending ? (
            <>
              <Loader2 className="animate-spin" />
              Starting
            </>
          ) : (
            <>
              {buttonLabel}
              <ArrowRight className="transition-transform duration-150 group-hover/submit:translate-x-0.5" />
            </>
          )}
        </Button>
      </div>
      {state.error ? (
        <p
          role="alert"
          className="mt-2 font-mono text-[11.5px] text-destructive"
        >
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
