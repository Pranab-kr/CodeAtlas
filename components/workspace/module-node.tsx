"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { CSSProperties } from "react";

import { PAD_X } from "@/lib/graph/layout";
import { cn } from "@/lib/utils";

import { useGraphActions } from "./graph-actions";
import type { ModuleFlowNode } from "./graph-model";

// Handles are invisible anchors: an edge ends at the box, not at a dot.
const ANCHOR_STYLE: CSSProperties = {
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
        data.dimmed && "opacity-25",
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={ANCHOR_STYLE}
        isConnectable={false}
      />
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          openModule(id);
        }}
        title={data.directory}
        className={cn(
          "flex h-full w-full cursor-pointer flex-col justify-center gap-[2px] rounded-[4px] border bg-card text-left font-mono",
          data.selected
            ? "border-selection bg-selection/[0.06]"
            : "border-border hover:border-foreground/50",
          "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-selection",
        )}
        style={{ paddingInline: PAD_X }}
      >
        <span className="w-full truncate text-[12px] leading-4 text-foreground">
          {data.label}
        </span>
        <span className="flex w-full items-center gap-2 text-[10.5px] leading-3 tabular-nums">
          <span className="shrink-0 text-muted-foreground">
            {data.fileCount} {data.fileCount === 1 ? "file" : "files"}
          </span>
          <span
            className="ml-auto shrink-0 text-incoming"
            title="Distinct files that import this"
          >
            ←{data.fanIn}
          </span>
          <span
            className="shrink-0 text-outgoing"
            title="Distinct files this imports"
          >
            {data.fanOut}→
          </span>
        </span>
      </button>
      <Handle
        type="source"
        position={Position.Right}
        style={ANCHOR_STYLE}
        isConnectable={false}
      />
    </div>
  );
}
