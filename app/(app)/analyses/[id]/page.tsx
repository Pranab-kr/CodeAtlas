import { notFound } from "next/navigation";
import { Suspense } from "react";

import { ProgressView } from "@/components/analyses/progress-view";
import { RerunButton } from "@/components/analyses/rerun-button";
import { StatusBadge } from "@/components/analyses/status-badge";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { AnalysisView } from "@/components/workspace/analysis-view";
import { readCoverage } from "@/lib/analysis/coverage";
import { loadMap } from "@/lib/analysis/load";
import { env } from "@/lib/env";
import {
  isStage,
  isStale,
  isStatus,
  stageLabel,
  type Progress,
} from "@/lib/pipeline/stages";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { now } from "@/lib/time";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Parameter {
  params: Promise<{ id: string }>;
}

export default function AnalysisPage({ params }: Parameter) {
  return (
    <Suspense
      fallback={
        <p className="p-4 font-mono text-[11px] text-muted-foreground">
          Reading analysis…
        </p>
      }
    >
      <AnalysisBody params={params} />
    </Suspense>
  );
}

async function AnalysisBody({ params }: Parameter) {
  const { id } = await params;
  if (!UUID.test(id)) {
    notFound();
  }

  const supabase = await createServerSupabaseClient();
  const { data: analysis, error } = await supabase
    .from("analyses")
    .select(
      "id, project_id, status, stage, stage_message, error, commit_sha, framework, coverage, started_at, created_at, updated_at, finished_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return <LoadError message={error.message} />;
  }
  if (!analysis) {
    notFound();
  }

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("name, repository_url")
    .eq("id", analysis.project_id)
    .maybeSingle();

  if (projectError) {
    return <LoadError message={projectError.message} />;
  }
  if (!project) {
    notFound();
  }

  const initial = progressOf(analysis);
  const stale = isStale(analysis, now());

  if (analysis.status === "succeeded") {
    // Everything below is rendered here rather than in child server
    // components: the authenticated client holds an accessToken function, and
    // passing it as a component prop breaks Flight's debug serialization.
    const coverage = readCoverage(analysis.coverage);

    if (coverage === null) {
      return (
        <div className="flex h-full flex-col">
          <AnalysisBar
            name={project.name}
            url={project.repository_url}
            commit={analysis.commit_sha}
            analysisId={analysis.id}
            rerun={false}
          />
          <div className="mx-auto w-full max-w-2xl px-4 py-6">
            <h2 className="text-[13px] font-medium">No stored map</h2>
            <p className="mt-1 max-w-lg text-[11px] text-muted-foreground">
              This analysis has no stored files, so there is nothing to draw.
              Run it again to parse the repository.
            </p>
            <div className="mt-3">
              <RerunButton analysisId={analysis.id} />
            </div>
          </div>
        </div>
      );
    }

    const map = await loadMap(supabase, analysis.id);

    return (
      <div className="flex h-full flex-col">
        <AnalysisBar
          name={project.name}
          url={project.repository_url}
          commit={analysis.commit_sha}
          analysisId={analysis.id}
          rerun
        />
        {map.files.length === 0 ? (
          <div className="mx-auto w-full max-w-2xl px-4 py-6">
            <h2 className="text-[13px] font-medium">No source files</h2>
            <p className="mt-1 max-w-lg text-[11px] text-muted-foreground">
              The archive was parsed, but it contained no TypeScript or
              JavaScript files to draw.
            </p>
          </div>
        ) : (
          <div className="min-h-0 flex-1">
            <AnalysisView
              analysisId={analysis.id}
              aiConfigured={env.aiConfigured}
              tracingConfigured={env.tracingConfigured}
              repository={{
                name: project.name,
                framework: analysis.framework ?? "none",
                skipped: coverage.files.skipped,
                unresolved: coverage.imports.unresolved,
                routes: map.routes.length,
              }}
              coverage={coverage}
              files={map.files}
              edges={map.edges}
              routes={map.routes}
              routeCoverage={coverage.routes}
            />
          </div>
        )}
      </div>
    );
  }

  if (analysis.status === "failed") {
    return (
      <div className="h-full overflow-auto">
        <div className="mx-auto w-full max-w-2xl px-4 py-5">
          <AnalysisHeading
            name={project.name}
            url={project.repository_url}
            commit={analysis.commit_sha}
          />
          <div className="mt-6 border border-destructive/30 bg-destructive/5 px-3 py-2">
            <div className="flex items-center gap-2">
              <StatusBadge status="failed" />
              <span className="text-[11px]">
                Failed at {stageLabel(initial.stage)}
              </span>
            </div>
            <p className="mt-2 font-mono text-[10.5px] whitespace-pre-wrap text-destructive">
              {analysis.error ?? "No reason was recorded."}
            </p>
            <div className="mt-3">
              <RerunButton analysisId={analysis.id} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto w-full max-w-2xl px-4 py-5">
        <AnalysisHeading
          name={project.name}
          url={project.repository_url}
          commit={analysis.commit_sha}
        />
        <ProgressView
          analysisId={analysis.id}
          initial={initial}
          staleAtRender={stale}
        />
      </div>
    </div>
  );
}

function AnalysisBar({
  name,
  url,
  commit,
  analysisId,
  rerun,
}: {
  name: string;
  url: string;
  commit: string | null;
  analysisId: string;
  rerun: boolean;
}) {
  return (
    <header className="flex h-9 shrink-0 items-center gap-3 border-b border-border bg-card px-3">
      {/* Full navigation: a live progress channel can update while a
          client-side navigation is processing the Flight stream. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a
        href="/"
        className="text-[11px] text-muted-foreground hover:underline"
      >
        Analyses
      </a>
      <Separator orientation="vertical" className="h-4" />
      <span
        className="min-w-0 truncate font-mono text-[12px]"
        title={url}
      >
        {name}
      </span>
      {commit ? (
        <span
          className="font-mono text-[10.5px] text-muted-foreground"
          title={commit}
        >
          {commit.slice(0, 7)}
        </span>
      ) : null}
      <div className="ml-auto">
        {rerun ? <RerunButton analysisId={analysisId} /> : null}
      </div>
    </header>
  );
}

function AnalysisHeading({
  name,
  url,
  commit,
}: {
  name: string;
  url: string;
  commit: string | null;
}) {
  return (
    <header>
      <div className="flex items-baseline gap-2">
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/"
          className="text-[11px] text-muted-foreground hover:underline"
        >
          Analyses
        </a>
        <span aria-hidden className="text-[11px] text-muted-foreground">
          /
        </span>
        <h1 className="truncate font-mono text-[13px]">{name}</h1>
        {commit ? (
          <span
            className="font-mono text-[10.5px] text-muted-foreground"
            title={commit}
          >
            {commit.slice(0, 7)}
          </span>
        ) : null}
      </div>
      <p className="mt-0.5 font-mono text-[10.5px] text-muted-foreground">
        {url}
      </p>
    </header>
  );
}

function LoadError({ message }: { message: string }) {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-5">
      <Alert variant="destructive">
        <AlertTitle>Could not read this analysis.</AlertTitle>
        <AlertDescription className="font-mono text-[10.5px] wrap-break-word">
          {message}
        </AlertDescription>
      </Alert>
    </div>
  );
}

function progressOf(row: {
  status: string;
  stage: string | null;
  stage_message: string | null;
  error: string | null;
}): Progress {
  if (!isStatus(row.status)) {
    throw new Error(`Stored analysis has an unknown status: ${row.status}`);
  }
  if (row.stage !== null && !isStage(row.stage)) {
    throw new Error(`Stored analysis has an unknown stage: ${row.stage}`);
  }
  return {
    status: row.status,
    stage: row.stage,
    message: row.status === "failed" ? row.error : row.stage_message,
  };
}
