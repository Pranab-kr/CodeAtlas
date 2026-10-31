import { Badge } from "@/components/ui/badge";
import type { Status } from "@/lib/pipeline/stages";

export type ShownStatus = Status | "stale";

const LABELS: Record<ShownStatus, string> = {
  queued: "queued",
  running: "running",
  succeeded: "succeeded",
  failed: "failed",
  stale: "stale",
};

const STYLES: Record<ShownStatus, { dot: string; text: string }> = {
  queued: { dot: "bg-border", text: "text-muted-foreground" },
  running: { dot: "bg-foreground", text: "text-foreground" },
  succeeded: { dot: "bg-foreground/40", text: "text-muted-foreground" },
  failed: { dot: "bg-destructive", text: "text-destructive" },
  stale: {
    dot: "border border-dashed border-muted-foreground",
    text: "text-muted-foreground",
  },
};

export function StatusBadge({ status }: { status: ShownStatus }) {
  const style = STYLES[status];
  return (
    <Badge
      variant="outline"
      className={`h-4 gap-1.5 px-1.5 font-mono text-[10.5px] font-normal ${style.text}`}
    >
      <span aria-hidden className={`size-1.5 rounded-full ${style.dot} ${status === "running" ? "atlas-live" : ""}`} />
      {LABELS[status]}
    </Badge>
  );
}
