"use client";

import { TableCell, TableRow } from "@/components/ui/table";
import { useAnalysisProgress } from "@/hooks/use-analysis-progress";
import {
  isUnfinished,
  sameProgress,
  type Progress,
} from "@/lib/pipeline/stages";

import { StatusBadge } from "./status-badge";

export function AnalysisRow({
  id,
  repository,
  repositoryUrl,
  updated,
  initial,
  staleAtRender,
}: {
  id: string;
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
    <TableRow>
      <TableCell className="px-3 py-2 align-top">
        {/* A full navigation: this row holds a live channel, and a client-side
            navigation racing one of its updates breaks the Flight client. */}
        <a
          href={`/analyses/${id}`}
          className="block truncate font-mono text-[12px] hover:underline"
          title={repositoryUrl}
        >
          {repository}
        </a>
        {detail ? (
          <p
            className={`mt-0.5 truncate text-[10.5px] ${
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
      <TableCell className="px-3 py-2">
        <StatusBadge status={status} />
      </TableCell>
      <TableCell className="hidden px-3 py-2 sm:table-cell">
        <time className="font-mono text-[10.5px] text-muted-foreground">
          {updated}
        </time>
      </TableCell>
    </TableRow>
  );
}
