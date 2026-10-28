import { Suspense } from "react";
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
    <span
      className={`inline-flex items-center gap-1.5 font-mono text-[11px] ${style.text}`}
    >
      <span aria-hidden className={`size-1.5 rounded-full ${style.dot}`} />
      {known ? STATUS_LABELS[status] : status}
    </span>
  );
}

function AnalysesLoading() {
  return (
    <div className="mt-4 border border-border bg-surface px-3 py-3 font-mono text-[11px] text-muted-foreground">
      Reading analyses…
    </div>
  );
}

function AnalysesEmpty() {
  return (
    <div className="mt-4 border border-border bg-surface">
      <div className="border-b border-border bg-surface-muted/60 px-3 py-1.5 text-[10.5px] text-muted-foreground">
        analyses
      </div>
      <div className="px-3 py-10">
        <p className="text-[12px]">No analyses in this workspace yet.</p>
        <p className="mt-1 max-w-sm text-[11px] text-muted-foreground">
          The first repository mapped by this team will appear here with its
          state.
        </p>
      </div>
    </div>
  );
}

function AnalysesError({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="mt-4 border border-destructive/40 bg-destructive/5 px-3 py-2"
    >
      <p className="text-[12px] font-medium text-destructive">
        Could not read analyses.
      </p>
      <p className="mt-0.5 font-mono text-[10.5px] wrap-break-word text-destructive">
        {message}
      </p>
    </div>
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
    <div className="mt-4 overflow-hidden border border-border bg-surface">
      <table className="w-full table-fixed border-collapse">
        <thead>
          <tr className="border-b border-border bg-surface-muted/60">
            <th
              scope="col"
              className="px-3 py-1.5 text-left text-[10.5px] font-medium text-muted-foreground"
            >
              repository
            </th>
            <th
              scope="col"
              className="w-24 px-3 py-1.5 text-left text-[10.5px] font-medium text-muted-foreground"
            >
              state
            </th>
            <th
              scope="col"
              className="hidden w-36 px-3 py-1.5 text-left text-[10.5px] font-medium text-muted-foreground sm:table-cell"
            >
              updated
            </th>
          </tr>
        </thead>
        <tbody>
          {analyses.map((analysis) => {
            const project = projectsById.get(analysis.project_id);
            const detail =
              analysis.status === "failed"
                ? (analysis.error ?? analysis.stage_message)
                : analysis.stage_message;

            return (
              <tr
                key={analysis.id}
                className="border-b border-border last:border-b-0"
              >
                <td className="px-3 py-2 align-top">
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
                </td>
                <td className="px-3 py-2 align-middle">
                  <Status status={analysis.status} />
                </td>
                <td className="hidden px-3 py-2 align-middle sm:table-cell">
                  <time
                    dateTime={analysis.updated_at}
                    className="font-mono text-[10.5px] text-muted-foreground"
                  >
                    {formatUpdatedAt(analysis.updated_at)}
                  </time>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
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
