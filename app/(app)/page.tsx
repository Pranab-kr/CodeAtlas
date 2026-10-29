import { Suspense } from "react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type AnalysisStatus = "queued" | "running" | "succeeded" | "failed";

const STATUS_LABELS: Record<AnalysisStatus, string> = {
  queued: "queued",
  running: "running",
  succeeded: "succeeded",
  failed: "failed",
};

const STATUS_STYLES: Record<AnalysisStatus, { dot: string; text: string }> = {
  queued: { dot: "bg-border", text: "text-muted-foreground" },
  running: { dot: "bg-foreground", text: "text-foreground" },
  succeeded: { dot: "bg-foreground/40", text: "text-muted-foreground" },
  failed: { dot: "bg-destructive", text: "text-destructive" },
};

function isAnalysisStatus(value: string): value is AnalysisStatus {
  return (
    value === "queued" ||
    value === "running" ||
    value === "succeeded" ||
    value === "failed"
  );
}

const updatedAtFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : `${updatedAtFormatter.format(date)} UTC`;
}

function Status({ status }: { status: string }) {
  const known = isAnalysisStatus(status);
  const style = known
    ? STATUS_STYLES[status]
    : { dot: "bg-muted-foreground/50", text: "text-muted-foreground" };

  return (
    <Badge
      variant="outline"
      className={`h-4 gap-1.5 px-1.5 font-mono text-[10.5px] font-normal ${style.text}`}
    >
      <span aria-hidden className={`size-1.5 rounded-full ${style.dot}`} />
      {known ? STATUS_LABELS[status] : status}
    </Badge>
  );
}

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
          The first repository mapped by this team will appear here with its
          state.
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
    .select("id, project_id, status, stage_message, error, updated_at")
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
            const detail =
              analysis.status === "failed"
                ? (analysis.error ?? analysis.stage_message)
                : analysis.stage_message;

            return (
              <TableRow key={analysis.id}>
                <TableCell className="px-3 py-2 align-top">
                  <p
                    className="truncate font-mono text-[12px]"
                    title={project?.repository_url}
                  >
                    {project?.name ?? "unknown repository"}
                  </p>
                  {detail ? (
                    <p
                      className={`mt-0.5 truncate text-[10.5px] ${
                        analysis.status === "failed"
                          ? "text-destructive"
                          : "text-muted-foreground"
                      }`}
                      title={detail}
                    >
                      {detail}
                    </p>
                  ) : null}
                </TableCell>
                <TableCell className="px-3 py-2">
                  <Status status={analysis.status} />
                </TableCell>
                <TableCell className="hidden px-3 py-2 sm:table-cell">
                  <time
                    dateTime={analysis.updated_at}
                    className="font-mono text-[10.5px] text-muted-foreground"
                  >
                    {formatUpdatedAt(analysis.updated_at)}
                  </time>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}

export default function Home() {
  return (
    <section className="h-full overflow-auto">
      <div className="mx-auto w-full max-w-5xl px-4 py-5">
        <header>
          <h1 className="text-[13px] font-medium">Analyses</h1>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Repositories mapped by this workspace.
          </p>
        </header>
        <Suspense fallback={<AnalysesLoading />}>
          <AnalysesList />
        </Suspense>
      </div>
    </section>
  );
}
