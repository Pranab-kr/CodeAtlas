/**
 * What a run is doing, in a shape both the browser and the server can read.
 * Nothing here imports Node or a database client.
 */

export type Status = "queued" | "running" | "succeeded" | "failed";
export type Stage = "fetch" | "select" | "parse" | "store";

export interface Progress {
  status: Status;
  stage: Stage | null;
  /** The sentence the run wrote on the row. On failure, the reason. */
  message: string | null;
}

export const STAGES: readonly { stage: Stage; label: string }[] = [
  { stage: "fetch", label: "Fetch archive" },
  { stage: "select", label: "Select files" },
  { stage: "parse", label: "Parse imports" },
  { stage: "store", label: "Store map" },
];

export const STALE_AFTER_MS = 5 * 60 * 1000;

const STATUSES: readonly Status[] = [
  "queued",
  "running",
  "succeeded",
  "failed",
];

const STAGE_NAMES: readonly Stage[] = ["fetch", "select", "parse", "store"];

export function isStatus(value: string): value is Status {
  return STATUSES.some((status) => status === value);
}

export function isStage(value: string): value is Stage {
  return STAGE_NAMES.some((stage) => stage === value);
}

export function isUnfinished(status: Status): boolean {
  return status === "queued" || status === "running";
}

export function stageLabel(stage: Stage | null): string {
  return STAGES.find((entry) => entry.stage === stage)?.label ?? "Starting";
}

export function progressTopic(analysisId: string): string {
  return `analysis:${analysisId}`;
}

/**
 * A run that stops without failing is still stopped. Queued counts from when
 * the row was created; running from its last stage move, so a long run that is
 * still working is never called abandoned.
 */
export function isStale(
  row: {
    status: string;
    created_at: string;
    updated_at: string;
  },
  now: number,
): boolean {
  if (!isStatus(row.status) || !isUnfinished(row.status)) {
    return false;
  }
  const since = row.status === "running" ? row.updated_at : row.created_at;
  const last = Date.parse(since);
  return Number.isFinite(last) && now - last > STALE_AFTER_MS;
}

export function sameProgress(left: Progress, right: Progress): boolean {
  return (
    left.status === right.status &&
    left.stage === right.stage &&
    left.message === right.message
  );
}

/** The payload crosses a network boundary, so it's checked, not asserted. */
export function parseProgress(value: unknown): Progress | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const status = Reflect.get(value, "status");
  const stage = Reflect.get(value, "stage");
  const message = Reflect.get(value, "message");

  if (typeof status !== "string" || !isStatus(status)) {
    return null;
  }
  if (stage !== null && (typeof stage !== "string" || !isStage(stage))) {
    return null;
  }
  if (message !== null && typeof message !== "string") {
    return null;
  }

  return { status, stage, message };
}
