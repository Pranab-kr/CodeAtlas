import { Suspense } from "react";

import { AnalysisRow } from "@/components/analyses/analysis-row";
import { SubmitForm } from "@/components/analyses/submit-form";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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
    <Card className="mt-4 gap-0 py-0">
      <CardContent className="px-3 py-3 font-mono text-[11px] text-muted-foreground">
        Reading analyses…
      </CardContent>
    </Card>
  );
}

function AnalysesEmpty() {
  return (
    <Card className="mt-4 gap-0 py-0">
      <CardHeader className="bg-muted/60 px-3 py-1.5">
        <CardTitle className="font-mono text-[10.5px] font-normal text-muted-foreground">
          analyses
        </CardTitle>
      </CardHeader>
      <Separator />
      <CardContent className="px-3 py-10">
        <p className="text-[12px]">No analyses in this workspace yet.</p>
        <p className="mt-1 max-w-sm text-[11px] text-muted-foreground">
          Paste a public repository above to map it. Everyone in this
          workspace will see the result.
        </p>
      </CardContent>
    </Card>
  );
}

function AnalysesError({ message }: { message: string }) {
  return (
    <Alert variant="destructive" className="mt-4">
      <AlertTitle>Could not read analyses.</AlertTitle>
      <AlertDescription className="font-mono text-[10.5px] wrap-break-word">
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
    return <AnalysesError message={error.message} />;
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
    return <AnalysesError message={projectsError.message} />;
  }

  const projectsById = new Map(
    projects.map((project) => [project.id, project]),
  );
  const currentTime = now();

  return (
    <Card className="mt-4 gap-0 py-0">
      <Table className="table-fixed">
        <TableHeader>
          <TableRow className="bg-muted/60 hover:bg-muted/60">
            <TableHead className="h-7 px-3 text-[10.5px] font-medium text-muted-foreground">
              repository
            </TableHead>
            <TableHead className="h-7 w-24 px-3 text-[10.5px] font-medium text-muted-foreground">
              state
            </TableHead>
            <TableHead className="hidden h-7 w-36 px-3 text-[10.5px] font-medium text-muted-foreground sm:table-cell">
              updated
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
    </Card>
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
    <section className="h-full overflow-auto">
      <div className="mx-auto w-full max-w-5xl px-4 py-5">
        <header>
          <h1 className="text-[13px] font-medium">Analyses</h1>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Repositories mapped by this workspace.
          </p>
        </header>
        <SubmitForm />
        <Suspense fallback={<AnalysesLoading />}>
          <AnalysesList />
        </Suspense>
      </div>
    </section>
  );
}
