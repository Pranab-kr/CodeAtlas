import { Badge } from "@/components/ui/badge";
import type { Status } from "@/lib/pipeline/stages";
import { cn } from "@/lib/utils";

export type ShownStatus = Status | "stale";

const LABELS: Record<ShownStatus, string> = {
  queued: "Queued",
  running: "Running",
  succeeded: "Ready",
  failed: "Failed",
  stale: "Stale",
};

const STYLES: Record<ShownStatus, { dot: string; pill: string }> = {
  queued: {
    dot: "bg-muted-foreground/50",
    pill: "border-hairline-strong bg-well/80 text-muted-foreground",
  },
  running: {
    dot: "bg-selection atlas-live",
    pill: "border-selection/30 bg-selection/10 text-foreground",
  },
  succeeded: {
    dot: "bg-incoming",
    pill: "border-incoming/25 bg-incoming/10 text-foreground",
  },
  failed: {
    dot: "bg-destructive",
    pill: "border-destructive/30 bg-destructive/10 text-destructive",
  },
  stale: {
    dot: "border border-dashed border-muted-foreground",
    pill: "border-hairline-strong bg-well/60 text-muted-foreground",
  },
};

export function StatusBadge({ status }: { status: ShownStatus }) {
  const style = STYLES[status];
  return (
    <Badge
      variant="outline"
      className={cn("h-5 gap-1.5 rounded-full px-2 text-[11px] font-medium", style.pill)}
    >
      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", style.dot)} />
      {LABELS[status]}
    </Badge>
  );
}
