"use client";

import Link from "next/link";
import { useEffect } from "react";

import { AtlasMark } from "@/components/brand/mark";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function AppError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error("[app] unhandled route error", error);
  }, [error]);

  return (
    <main className="atlas-dot-well flex min-h-dvh items-center justify-center p-6">
      <div className="atlas-window w-full max-w-md rounded-2xl p-6">
        <div className="flex items-center gap-2.5">
          <span className="flex size-7 items-center justify-center rounded-lg bg-well shadow-2xs">
            <AtlasMark className="size-4" />
          </span>
          <span className="text-[13.5px] font-medium">CodeAtlas</span>
        </div>

        <h1 className="mt-4 text-[15px] font-medium tracking-[-0.01em] text-foreground">
          Something went wrong
        </h1>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
          An unexpected error interrupted this page. You can retry the request
          or return to your analyses.
        </p>

        {error.digest ? (
          <p className="mt-3 font-mono text-[11px] text-muted-foreground">
            Reference: {error.digest}
          </p>
        ) : null}

        <div className="mt-5 flex items-center gap-2">
          <Button type="button" size="sm" onClick={reset}>
            Try again
          </Button>
          <Link
            href="/dashboard"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Back to analyses
          </Link>
        </div>
      </div>
    </main>
  );
}
