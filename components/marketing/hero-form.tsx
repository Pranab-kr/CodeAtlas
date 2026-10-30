"use client";

import { useActionState, useEffect } from "react";

import {
  startFromLanding,
  type LandingState,
} from "@/app/landing-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const INITIAL: LandingState = { error: null, next: null };

export function HeroForm() {
  const [state, action, pending] = useActionState(startFromLanding, INITIAL);

  useEffect(() => {
    if (state.next) {
      window.location.assign(state.next);
    }
  }, [state.next]);

  return (
    <form action={action} className="mt-8 w-full max-w-[30rem]">
      <label htmlFor="repository-url" className="sr-only">
        Public GitHub repository URL
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id="repository-url"
          name="url"
          required
          autoComplete="off"
          spellCheck={false}
          aria-invalid={state.error ? true : undefined}
          placeholder="github.com/owner/repo"
          className="h-11 flex-1 font-mono text-[13px]"
        />
        <Button
          type="submit"
          size="lg"
          className="h-11 px-4"
          disabled={pending}
        >
          {pending ? "Starting…" : "Analyse repository"}
        </Button>
      </div>
      {state.error ? (
        <p
          role="alert"
          className="mt-2 font-mono text-[11px] text-destructive"
        >
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
