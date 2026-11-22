"use client";

import { TableCell, TableRow } from "@/components/ui/table";
import { useAnalysisProgress } from "@/hooks/use-analysis-progress";
import {
  isUnfinished,
  sameProgress,
  type Progress,
} from "@/lib/pipeline/stages";

import { DeleteProjectButton } from "./delete-project-button";
import { StatusBadge } from "./status-badge";

export function AnalysisRow({
  id,
  projectId,
  repository,
  repositoryUrl,
  updated,
  initial,
  staleAtRender,
}: {
  id: string;
  projectId: string;
  repository: string;
  repositoryUrl: string;
  updated: string;
  initial: Progress;
  staleAtRender: boolean;
}) {
  const { progress } = useAnalysisProgress(id, initial);
  // Stale only while nothing has arrived since the server render: a broadcast
  // is fresher than the render, so it clears the mark.
  const stale =
    staleAtRender &&
    isUnfinished(progress.status) &&
    sameProgress(progress, initial);
  const status = stale ? "stale" : progress.status;
  const detail =
    progress.status === "failed"
      ? progress.message
      : stale
        ? "No progress for over 5 minutes. Re-run it from the analysis."
        : progress.message;

  return (
    <TableRow className="group">
      <TableCell className="px-4 py-3 align-middle">
        {/* A full navigation: this row holds a live channel, and a client-side
            navigation racing one of its updates breaks the Flight client. */}
        <a
          href={`/analyses/${id}`}
          className="block truncate font-mono text-[12.5px] font-medium text-foreground transition-colors group-hover:text-selection hover:underline"
          title={repositoryUrl}
        >
          {repository}
        </a>
        {detail ? (
          <p
            className={`mt-0.5 truncate text-[11.5px] ${
              progress.status === "failed"
                ? "text-destructive"
                : "text-muted-foreground"
            }`}
            title={detail}
          >
            {detail}
          </p>
        ) : null}
      </TableCell>
      <TableCell className="px-4 py-3">
        <StatusBadge status={status} />
      </TableCell>
      <TableCell className="hidden px-4 py-3 sm:table-cell">
        <time className="font-mono text-[11.5px] text-muted-foreground tabular-nums">
          {updated}
        </time>
      </TableCell>
      <TableCell className="px-3 py-3 text-right">
        <DeleteProjectButton
          projectId={projectId}
          repository={repository}
          iconOnly
        />
      </TableCell>
    </TableRow>
  );
}
