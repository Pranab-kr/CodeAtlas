import { Suspense } from "react";

import { startRepositoryAnalysis } from "@/app/(app)/actions";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { StartRedirect } from "./start-redirect";

interface Parameter {
  searchParams: Promise<{ url?: string | string[] }>;
}

export default function AnalysePage({ searchParams }: Parameter) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <Suspense fallback={<Starting />}>
        <Analyse searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Analyse({ searchParams }: Parameter) {
  const url = (await searchParams).url;

  if (typeof url !== "string" || url.trim() === "") {
    return (
      <div className="w-full max-w-sm">
        <h1 className="text-[13px] font-medium">No repository to analyse</h1>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Paste a public GitHub repository URL to start.
        </p>
        <a
          href="/dashboard"
          className={cn(buttonVariants({ size: "sm" }), "mt-3")}
        >
          Back to analyses
        </a>
      </div>
    );
  }

  const result = await startRepositoryAnalysis(url);

  if (result.analysisId) {
    return <StartRedirect analysisId={result.analysisId} />;
  }

  return (
    <div className="w-full max-w-md">
      <Alert variant="destructive">
        <AlertTitle>Could not start the analysis.</AlertTitle>
        <AlertDescription className="font-mono text-[10.5px] wrap-break-word">
          {result.error ?? "No reason was recorded."}
        </AlertDescription>
      </Alert>
      <a
        href="/dashboard"
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "mt-3",
        )}
      >
        Back to analyses
      </a>
    </div>
  );
}

function Starting() {
  return (
    <p className="font-mono text-[11px] text-muted-foreground">
      Starting the analysis…
    </p>
  );
}
