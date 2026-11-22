import { Loader2 } from "lucide-react";
import { Suspense } from "react";

import { AtlasMark } from "@/components/brand/mark";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import {
  parseRepositoryUrl,
  PipelineError,
  type Repository,
} from "@/lib/pipeline/github";
import { cn } from "@/lib/utils";
import { StartRedirect } from "./start-redirect";

interface Parameter {
  searchParams: Promise<{ url?: string | string[] }>;
}

export default function AnalysePage({ searchParams }: Parameter) {
  return (
    <main className="atlas-dot-well flex min-h-dvh items-center justify-center p-6">
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
      <div className="atlas-window w-full max-w-sm rounded-2xl p-5">
        <div className="flex items-center gap-2.5">
          <span className="flex size-7 items-center justify-center rounded-lg bg-well shadow-2xs">
            <AtlasMark className="size-4" />
          </span>
          <span className="text-[13.5px] font-medium">CodeAtlas</span>
        </div>
        <h1 className="mt-4 text-[14px] font-medium">
          No repository to analyse
        </h1>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
          Paste a public GitHub repository URL to start.
        </p>
        <a
          href="/dashboard"
          className={cn(buttonVariants({ size: "sm" }), "mt-4")}
        >
          Back to analyses
        </a>
      </div>
    );
  }

  let repository: Repository;
  try {
    repository = parseRepositoryUrl(url);
  } catch (error) {
    const message =
      error instanceof PipelineError
        ? error.message
        : error instanceof Error
          ? error.message
          : String(error);

    return (
      <div className="atlas-window w-full max-w-md rounded-2xl p-5">
        <Alert variant="destructive" className="rounded-xl">
          <AlertTitle>Could not start the analysis.</AlertTitle>
          <AlertDescription className="font-mono text-[11px] wrap-break-word">
            {message}
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

  // Starting the run happens through a POST Server Action on mount rather than
  // during this GET render, so prefetches and crawlers can't trigger analyses.
  return <StartRedirect repositoryUrl={repository.url} />;
}

function Starting() {
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
