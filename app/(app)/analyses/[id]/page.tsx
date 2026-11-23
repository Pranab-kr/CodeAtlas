import {
  AlertCircle,
  ChevronLeft,
  FileCode2,
  FolderX,
  GitCommitHorizontal,
  Loader2,
} from "lucide-react";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { DeleteProjectButton } from "@/components/analyses/delete-project-button";
import { ProgressView } from "@/components/analyses/progress-view";
import { RerunButton } from "@/components/analyses/rerun-button";
import { StatusBadge } from "@/components/analyses/status-badge";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
        <div className="flex h-full items-center justify-center bg-well/40">
          <div className="flex items-center gap-2 rounded-full bg-surface px-3.5 py-1.5 text-[12px] text-muted-foreground shadow-xs">
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            <span>Reading analysis…</span>
          </div>
        </div>
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
    console.error("[analysis] failed to load analysis", error);
    return (
      <LoadError message="Could not load this analysis right now. Please refresh and try again." />
    );
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
    console.error("[analysis] failed to load project", projectError);
    return (
      <LoadError message="Could not load repository details right now. Please refresh and try again." />
    );
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
        <div className="flex h-full flex-col bg-well/40">
          <AnalysisBar
            projectId={analysis.project_id}
            name={project.name}
            url={project.repository_url}
            commit={analysis.commit_sha}
            framework={analysis.framework}
            analysisId={analysis.id}
            rerun={false}
          />
          <div className="flex flex-1 items-center justify-center p-6">
            <div className="atlas-window w-full max-w-md rounded-2xl bg-surface p-6 text-center">
              <div className="mx-auto flex size-10 items-center justify-center rounded-xl bg-well text-muted-foreground shadow-2xs">
                <FolderX className="size-4.5" aria-hidden="true" />
              </div>
              <h2 className="mt-4 text-[15px] font-medium tracking-[-0.01em] text-foreground">
                No stored map
              </h2>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                This analysis has no stored files, so there is nothing to draw.
                Run it again to parse the repository.
              </p>
              <div className="mt-5 flex justify-center">
                <RerunButton analysisId={analysis.id} />
              </div>
            </div>
          </div>
        </div>
      );
    }

    const map = await loadMap(supabase, analysis.id);

    return (
      <div className="flex h-full flex-col">
        <AnalysisBar
          projectId={analysis.project_id}
          name={project.name}
          url={project.repository_url}
          commit={analysis.commit_sha}
          framework={analysis.framework}
          analysisId={analysis.id}
          rerun
        />
        {map.files.length === 0 ? (
          <div className="flex flex-1 items-center justify-center bg-well/40 p-6">
            <div className="atlas-window w-full max-w-md rounded-2xl bg-surface p-6 text-center">
              <div className="mx-auto flex size-10 items-center justify-center rounded-xl bg-well text-muted-foreground shadow-2xs">
                <FileCode2 className="size-4.5" aria-hidden="true" />
              </div>
              <h2 className="mt-4 text-[15px] font-medium tracking-[-0.01em] text-foreground">
                No source files
              </h2>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                The archive was parsed, but it contained no TypeScript or
                JavaScript files to draw.
              </p>
            </div>
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
      <div className="h-full overflow-auto bg-well/40">
        <div className="mx-auto w-full max-w-2xl px-6 py-8">
          <AnalysisHeading
            projectId={analysis.project_id}
            name={project.name}
            url={project.repository_url}
            commit={analysis.commit_sha}
            framework={analysis.framework}
          />
          <div className="atlas-window mt-6 overflow-hidden rounded-2xl bg-surface">
            <div className="flex items-center gap-2.5 border-b border-hairline bg-destructive/[0.06] px-5 py-3.5">
              <AlertCircle
                className="size-4 shrink-0 text-destructive"
                aria-hidden="true"
              />
              <StatusBadge status="failed" />
              <span className="text-[12.5px] font-medium text-foreground">
                Failed at {stageLabel(initial.stage)}
              </span>
            </div>
            <div className="p-5">
              <p className="rounded-lg bg-well/70 p-3 font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap text-destructive">
                {analysis.error ?? "No reason was recorded."}
              </p>
              <div className="mt-4 flex items-center gap-2">
                <RerunButton analysisId={analysis.id} />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-well/40">
      <div className="mx-auto w-full max-w-2xl px-6 py-8">
        <AnalysisHeading
          projectId={analysis.project_id}
          name={project.name}
          url={project.repository_url}
          commit={analysis.commit_sha}
          framework={analysis.framework}
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
  projectId,
  name,
  url,
  commit,
  framework,
  analysisId,
  rerun,
}: {
  projectId: string;
  name: string;
  url: string;
  commit: string | null;
  framework: string | null;
  analysisId: string;
  rerun: boolean;
}) {
  return (
    <header className="flex h-10 shrink-0 items-center gap-2.5 border-b border-hairline bg-surface px-3.5">
      {/* Full navigation: a live progress channel can update while a
          client-side navigation is processing the Flight stream. */}
      <a
        href="/dashboard"
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[12px] text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
      >
        <ChevronLeft className="size-3.5" aria-hidden="true" />
        <span>Analyses</span>
      </a>
      <span aria-hidden className="text-[12px] text-muted-foreground/50">
        /
      </span>
      <span
        className="min-w-0 truncate font-mono text-[12.5px] font-medium text-foreground"
        title={url}
      >
        {name}
      </span>
      {framework && framework !== "none" ? (
        <Badge
          variant="outline"
          className="h-5 shrink-0 rounded-full px-2 font-mono text-[10.5px] font-normal text-muted-foreground"
        >
          {framework}
        </Badge>
      ) : null}
      {commit ? (
        <span
          className="inline-flex h-5 shrink-0 items-center gap-1 rounded-md bg-well px-1.5 font-mono text-[10.5px] leading-none text-muted-foreground shadow-2xs"
          title={commit}
        >
          <GitCommitHorizontal className="size-3 opacity-70" aria-hidden="true" />
          {commit.slice(0, 7)}
        </span>
      ) : null}
      <div className="ml-auto flex items-center gap-1.5">
        {rerun ? <RerunButton analysisId={analysisId} /> : null}
        <DeleteProjectButton projectId={projectId} repository={name} />
      </div>
    </header>
  );
}

function AnalysisHeading({
  projectId,
  name,
  url,
  commit,
  framework,
}: {
  projectId: string;
  name: string;
  url: string;
  commit: string | null;
  framework: string | null;
}) {
  return (
    <header className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <a
          href="/dashboard"
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 -ml-1.5 text-[12.5px] text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
        >
          <ChevronLeft className="size-3.5" aria-hidden="true" />
          <span>Analyses</span>
        </a>
        <span aria-hidden className="text-[12px] text-muted-foreground/50">
          /
        </span>
        <h1 className="truncate font-mono text-[14px] font-medium text-foreground">
          {name}
        </h1>
        {framework && framework !== "none" ? (
          <Badge
            variant="outline"
            className="h-5 shrink-0 rounded-full px-2 font-mono text-[10.5px] font-normal text-muted-foreground"
          >
            {framework}
          </Badge>
        ) : null}
        {commit ? (
          <span
            className="inline-flex h-5 shrink-0 items-center gap-1 rounded-md bg-surface px-1.5 font-mono text-[10.5px] leading-none text-muted-foreground shadow-2xs"
            title={commit}
          >
            <GitCommitHorizontal className="size-3 opacity-70" aria-hidden="true" />
            {commit.slice(0, 7)}
          </span>
        ) : null}
        <div className="ml-auto">
          <DeleteProjectButton projectId={projectId} repository={name} />
        </div>
      </div>
      <p className="truncate font-mono text-[11.5px] text-muted-foreground">
        {url}
      </p>
    </header>
  );
}

function LoadError({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center bg-well/40 p-6">
      <div className="w-full max-w-xl">
        <Alert variant="destructive" className="rounded-xl bg-surface shadow-sm">
          <AlertTitle>Could not read this analysis.</AlertTitle>
          <AlertDescription className="font-mono text-[11.5px] wrap-break-word">
            {message}
          </AlertDescription>
        </Alert>
      </div>
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
