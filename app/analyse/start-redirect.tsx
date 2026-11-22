"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { startRepositoryAnalysis } from "@/app/(app)/actions";
import { AtlasMark } from "@/components/brand/mark";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Starts the analysis through a POST Server Action and then performs a full
 * document load. The analysis page subscribes to live stage updates, and a
 * client-side navigation overlapping one of those updates breaks the Flight
 * client in Next 16.
 */
export function StartRedirect({ repositoryUrl }: { repositoryUrl: string }) {
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) {
      return;
    }
    started.current = true;

    void startRepositoryAnalysis(repositoryUrl)
      .then((result) => {
        if (result.analysisId) {
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a full load keeps the live progress channel away from the Flight stream
          window.location.assign(`/analyses/${result.analysisId}`);
          return;
        }
        setError(result.error ?? "No reason was recorded.");
      })
      .catch((cause) => {
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not start the analysis.",
        );
      });
  }, [repositoryUrl]);

  if (error !== null) {
    return (
      <div className="atlas-window w-full max-w-md rounded-2xl p-5">
        <Alert variant="destructive" className="rounded-xl">
          <AlertTitle>Could not start the analysis.</AlertTitle>
          <AlertDescription className="font-mono text-[11px] wrap-break-word">
            {error}
          </AlertDescription>
        </Alert>
        <a
          href="/dashboard"
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "mt-4",
          )}
        >
          Back to analyses
        </a>
      </div>
    );
  }

  return (
    <div className="atlas-window w-full max-w-sm rounded-2xl p-5">
      <div className="flex items-center gap-2.5">
        <span className="flex size-7 items-center justify-center rounded-lg bg-well shadow-2xs">
          <AtlasMark className="size-4" />
        </span>
        <span className="text-[13.5px] font-medium">CodeAtlas</span>
      </div>
      <div className="mt-4 flex items-center gap-2 text-[12.5px] text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        <span>Starting the analysis…</span>
      </div>
    </div>
  );
}
