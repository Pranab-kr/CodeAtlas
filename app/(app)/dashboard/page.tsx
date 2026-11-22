import { Loader2 } from "lucide-react";
import { Suspense } from "react";

import { AnalysisRow } from "@/components/analyses/analysis-row";
import { SubmitForm } from "@/components/analyses/submit-form";
import { AtlasMark } from "@/components/brand/mark";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  isStage,
  isStale,
  isStatus,
  type Progress,
} from "@/lib/pipeline/stages";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { formatUpdatedAt, now } from "@/lib/time";

function AnalysesLoading() {
  return (
    <div className="atlas-surface mt-6 flex items-center gap-2.5 rounded-2xl px-5 py-6 text-[12.5px] text-muted-foreground">
      <Loader2 className="size-3.5 animate-spin" />
      <span>Reading workspace analyses…</span>
    </div>
  );
}

function AnalysesEmpty() {
  return (
    <div className="atlas-window mt-6 overflow-hidden rounded-2xl">
      <div className="border-b border-hairline bg-chrome/70 px-4 py-2.5">
        <span className="text-[11.5px] font-medium text-muted-foreground">
          Repositories
        </span>
      </div>
      <div className="flex flex-col items-start gap-3.5 px-6 py-12">
        <span className="flex size-10 items-center justify-center rounded-xl bg-well shadow-2xs">
          <AtlasMark className="size-5 text-muted-foreground" />
        </span>
        <div>
          <p className="text-[14px] font-medium">
            No repositories mapped in this workspace yet
          </p>
          <p className="mt-1 max-w-md text-[12.5px] leading-relaxed text-muted-foreground">
            Paste a public GitHub repository URL above to parse its dependency
            map. Everyone in this workspace will see the result.
          </p>
        </div>
      </div>
    </div>
  );
}

function AnalysesError({ message }: { message: string }) {
  return (
    <Alert variant="destructive" className="mt-6 rounded-xl">
      <AlertTitle>Could not read analyses.</AlertTitle>
      <AlertDescription className="font-mono text-[11px] wrap-break-word">
        {message}
      </AlertDescription>
    </Alert>
  );
}

async function AnalysesList() {
  const supabase = await createServerSupabaseClient();

  // No organization filter here on purpose. The policy decides which rows
  // exist for this token.
  const { data: analyses, error } = await supabase
    .from("analyses")
    .select(
      "id, project_id, status, stage, stage_message, error, started_at, created_at, updated_at",
    )
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[dashboard] failed to load analyses", error);
    return (
      <AnalysesError message="Could not load analyses right now. Please refresh and try again." />
    );
  }

  if (analyses.length === 0) {
    return <AnalysesEmpty />;
  }

  const projectIds = [
    ...new Set(analyses.map((analysis) => analysis.project_id)),
  ];
  const { data: projects, error: projectsError } = await supabase
    .from("projects")
    .select("id, name, repository_url")
    .in("id", projectIds);

  if (projectsError) {
    console.error("[dashboard] failed to load projects", projectsError);
    return (
      <AnalysesError message="Could not load repository details right now. Please refresh and try again." />
    );
  }

  const projectsById = new Map(
    projects.map((project) => [project.id, project]),
  );
  const currentTime = now();

  return (
    <div className="atlas-window mt-6 overflow-hidden rounded-2xl">
      <div className="flex items-center justify-between border-b border-hairline bg-chrome/70 px-4 py-2.5">
        <span className="text-[12px] font-medium text-foreground">
          Mapped repositories
        </span>
        <span className="rounded-full bg-well px-2 py-0.5 font-mono text-[11px] text-muted-foreground tabular-nums">
          {analyses.length}
        </span>
      </div>
      <Table className="table-fixed">
        <TableHeader>
          <TableRow className="bg-surface hover:bg-surface">
            <TableHead className="h-9 px-4 text-[11px] font-medium text-muted-foreground">
              Repository
            </TableHead>
            <TableHead className="h-9 w-28 px-4 text-[11px] font-medium text-muted-foreground">
              Status
            </TableHead>
            <TableHead className="hidden h-9 w-36 px-4 text-[11px] font-medium text-muted-foreground sm:table-cell">
              Updated
            </TableHead>
            <TableHead className="h-9 w-12 px-3">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {analyses.map((analysis) => {
            const project = projectsById.get(analysis.project_id);
            const initial = progressOf(analysis);
            const key = [
              analysis.id,
              analysis.status,
              analysis.stage ?? "",
              initial.message ?? "",
              analysis.started_at ?? "",
            ].join(":");

            return (
              <AnalysisRow
                key={key}
                id={analysis.id}
                projectId={analysis.project_id}
                repository={project?.name ?? "unknown repository"}
                repositoryUrl={project?.repository_url ?? ""}
                updated={formatUpdatedAt(analysis.updated_at)}
                initial={initial}
                staleAtRender={isStale(analysis, currentTime)}
              />
            );
          })}
        </TableBody>
      </Table>
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

export default function DashboardPage() {
  return (
    <section className="atlas-scroll h-full overflow-auto bg-well/40">
      <div className="mx-auto w-full max-w-5xl px-6 py-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="atlas-kicker">Workspace</p>
            <h1 className="mt-1.5 text-[22px] font-medium tracking-[-0.03em]">
              Analyses
            </h1>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Repositories parsed and shared across this workspace.
            </p>
          </div>
          <SubmitForm />
        </div>
        <Suspense fallback={<AnalysesLoading />}>
          <AnalysesList />
        </Suspense>
      </div>
    </section>
  );
}
