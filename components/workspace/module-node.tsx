"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";

import { useGraphActions } from "./graph-actions";
import type { ModuleFlowNode } from "./graph-model";

const HIDDEN_HANDLE_STYLE: CSSProperties = {
  width: 1,
  height: 1,
  minWidth: 0,
  minHeight: 0,
  opacity: 0,
  border: 0,
  background: "transparent",
};

export function ModuleNode({ id, data }: NodeProps<ModuleFlowNode>) {
  const { openModule } = useGraphActions();

  return (
    <div
      className={cn(
        "nopan relative h-full w-full",
        data.dimmed && "opacity-20",
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        style={HIDDEN_HANDLE_STYLE}
      />
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          openModule(id);
        }}
        title={`${data.directory}, ${data.fileCount} files, fan-in ${data.fanIn}, fan-out ${data.fanOut}`}
        className={cn(
          "flex h-full w-full cursor-pointer flex-col justify-between rounded-[3px] border bg-card px-2 py-1.5 text-left font-mono",
          data.selected
            ? "border-selection bg-selection/[0.06]"
            : "border-border hover:border-foreground/50",
          "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-selection",
        )}
      >
        <span className="min-w-0 truncate text-[11px] leading-none text-foreground">
          {data.label}
        </span>
        <span className="flex w-full items-center gap-1.5 text-[9px] leading-none tabular-nums">
          <span className="shrink-0 text-muted-foreground">
            {data.fileCount} files
          </span>
          <span className="ml-auto shrink-0 text-incoming" aria-hidden>
            ←{data.fanIn}
          </span>
          <span className="shrink-0 text-outgoing" aria-hidden>
            {data.fanOut}→
          </span>
          <span className="sr-only">
            {data.fanIn} incoming, {data.fanOut} outgoing
          </span>
        </span>
      </button>
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        style={HIDDEN_HANDLE_STYLE}
      />
    </div>
  );
}
