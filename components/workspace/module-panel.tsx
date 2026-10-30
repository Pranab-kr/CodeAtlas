"use client";

import {
  Handle,
  Position,
  useUpdateNodeInternals,
  type NodeProps,
} from "@xyflow/react";
import {
  useEffect,
  useRef,
  type CSSProperties,
  type WheelEvent,
} from "react";

import {
  PAD_X,
  PANEL_HEADER_HEIGHT,
  PANEL_ROW_HEIGHT,
} from "@/lib/graph/layout";
import {
  ABOVE_HANDLE,
  BELOW_HANDLE,
  MAX_ROWS,
} from "@/lib/graph/view";
import { cn } from "@/lib/utils";

import { useGraphActions } from "./graph-actions";
import { useMapHover } from "./graph-hover";
import type { PanelFlowNode } from "./graph-model";

// Handles are invisible anchors: an edge ends at the row, not at a dot.
const ANCHOR_STYLE: CSSProperties = {
  width: 1,
  height: 1,
  minWidth: 0,
  minHeight: 0,
  opacity: 0,
  border: 0,
  background: "transparent",
};

const HEADER_STYLE: CSSProperties = {
  height: PANEL_HEADER_HEIGHT,
  paddingInline: PAD_X,
};

const ROW_STYLE: CSSProperties = {
  height: PANEL_ROW_HEIGHT,
  paddingInline: PAD_X,
};

export function ModulePanel({ id, data }: NodeProps<PanelFlowNode>) {
  const { closeModule, selectFile, scroll, hover } = useGraphActions();
  const mapHover = useMapHover();
  const headerHovered =
    mapHover.selection?.kind === "node" &&
    mapHover.selection.id === id;
  const panelHovered = mapHover.endpoint?.object === id;
  const isHovered = (handle: string): boolean =>
    mapHover.endpoint?.object === id &&
    mapHover.endpoint.handle === handle;
  // Wheel deltas arrive in pixels from trackpads and in lines from some mice;
  // they add up until they make a whole row, so slow scrolling still moves.
  const pending = useRef(0);
  // React Flow measures handles when a node resizes. Scrolling swaps rows at a
  // fixed size, so the new rows' handles have to be measured explicitly or
  // their edges have nothing to attach to.
  const updateNodeInternals = useUpdateNodeInternals();

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, data.offset, updateNodeInternals]);

  function onWheel(event: WheelEvent) {
    if (!data.scrolls) {
      return;
    }
    pending.current +=
      event.deltaMode === 1
        ? event.deltaY * PANEL_ROW_HEIGHT
        : event.deltaY;
    const rows = Math.trunc(pending.current / PANEL_ROW_HEIGHT);
    if (rows === 0) {
      return;
    }
    pending.current -= rows * PANEL_ROW_HEIGHT;
    scroll(id, data.offset + rows);
  }

  return (
    <div
      className={cn(
        "nopan flex h-full w-full select-none flex-col overflow-hidden rounded-md border bg-card",
        data.selected ? "border-selection" : "border-border",
        data.dimmed && !panelHovered && "opacity-25",
      )}
    >
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          closeModule(id);
        }}
        onMouseEnter={() => hover({ kind: "node", id })}
        onMouseLeave={() => hover(null)}
        title={`${data.directory} — click to fold`}
        style={HEADER_STYLE}
        className={cn(
          "flex shrink-0 cursor-pointer flex-col justify-center gap-[2px] border-b border-border text-left",
          data.selected
            ? "bg-selection/[0.06] hover:bg-selection/10"
            : "bg-muted/30 hover:bg-muted/50",
          headerHovered &&
            "shadow-[inset_0_0_0_1px_var(--selection)]",
          "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-selection",
        )}
      >
        <span className="flex w-full items-center gap-2">
          <span className="min-w-0 truncate text-[12px] font-semibold leading-4 text-foreground">
            {data.label}
          </span>
          <span className="ml-auto shrink-0 text-[10.5px] leading-3 text-muted-foreground tabular-nums">
            {data.matched !== null
              ? `${data.matched}/${data.fileCount}`
              : data.fileCount}{" "}
            {data.fileCount === 1 ? "file" : "files"}
          </span>
          <span
            aria-hidden
            className="shrink-0 text-[12px] leading-3 text-muted-foreground"
          >
            ×
          </span>
        </span>
        <span className="flex w-full items-center gap-2 text-[10.5px] leading-3 tabular-nums">
          <span
            className="text-incoming"
            title="Distinct files that import this"
          >
            ←{data.fanIn}
          </span>
          <span
            className="text-outgoing"
            title="Distinct files this imports"
          >
            {data.fanOut}→
          </span>
          <span className="sr-only">
            {data.fanIn} incoming, {data.fanOut} outgoing
          </span>
        </span>
        <span className="sr-only">close panel</span>
      </button>

      {/* nowheel: the wheel scrolls the rows here instead of zooming the map. */}
      <ul
        className={data.scrolls ? "nowheel" : undefined}
        onWheel={onWheel}
      >
        {data.scrolls ? (
          <OffscreenRow
            handle={ABOVE_HANDLE}
            count={data.above}
            label="above"
            dimmed={data.aboveDimmed}
            hovered={isHovered(ABOVE_HANDLE)}
            onClick={() =>
              scroll(id, data.offset - MAX_ROWS)
            }
          />
        ) : null}

        {data.rows.map((row) => (
          <li
            key={row.path}
            className="relative"
            style={{ height: PANEL_ROW_HEIGHT }}
          >
            <Handle
              id={row.path}
              type="target"
              position={Position.Left}
              style={ANCHOR_STYLE}
              isConnectable={false}
            />
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                selectFile(row.path);
              }}
              onMouseEnter={() =>
                hover({ kind: "file", path: row.path })
              }
              onMouseLeave={() => hover(null)}
              aria-pressed={row.selected}
              title={row.path}
              style={ROW_STYLE}
              className={cn(
                "flex size-full cursor-pointer items-center gap-[6px] text-left text-[11.5px]",
                row.selected
                  ? "bg-selection/10 text-foreground shadow-[inset_2px_0_0_var(--selection)]"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                isHovered(row.path) &&
                  "shadow-[inset_0_0_0_1px_var(--selection)]",
                row.dimmed && !isHovered(row.path) && "opacity-25",
                "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-selection",
              )}
            >
              <span
                aria-hidden
                className="size-[8px] shrink-0 rounded-xs"
                style={{
                  backgroundColor:
                    row.tone === null
                      ? "var(--muted-foreground)"
                      : `var(--kind-${row.tone + 1})`,
                }}
              />
              <span className="min-w-0 flex-1 truncate font-mono">
                {row.label}
              </span>
              <span className="flex shrink-0 items-center gap-[6px] font-mono text-[10.5px] tabular-nums">
                <span
                  className="text-incoming"
                  title="Distinct files that import this"
                >
                  ←{row.fanIn}
                </span>
                <span
                  className="text-outgoing"
                  title="Distinct files this imports"
                >
                  {row.fanOut}→
                </span>
                <span className="sr-only">
                  {row.fanIn} incoming, {row.fanOut} outgoing
                </span>
              </span>
            </button>
            <Handle
              id={row.path}
              type="source"
              position={Position.Right}
              style={ANCHOR_STYLE}
              isConnectable={false}
            />
          </li>
        ))}

        {data.scrolls ? (
          <OffscreenRow
            handle={BELOW_HANDLE}
            count={data.below}
            label="below"
            dimmed={data.belowDimmed}
            hovered={isHovered(BELOW_HANDLE)}
            onClick={() =>
              scroll(id, data.offset + MAX_ROWS)
            }
          />
        ) : null}
      </ul>
    </div>
  );
}

// Stands for the files scrolled out of the window on one side. Edges to those
// files end here, so they stay attached to the panel rather than vanishing.
// Clicking pages the window that way.
function OffscreenRow({
  handle,
  count,
  label,
  dimmed,
  hovered,
  onClick,
}: {
  handle: string;
  count: number;
  label: string;
  dimmed: boolean;
  hovered: boolean;
  onClick: () => void;
}) {
  return (
    <li
      className="relative"
      style={{ height: PANEL_ROW_HEIGHT }}
    >
      <Handle
        id={handle}
        type="target"
        position={Position.Left}
        style={ANCHOR_STYLE}
        isConnectable={false}
      />
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onClick();
        }}
        disabled={count === 0}
        style={ROW_STYLE}
        className={cn(
          "flex size-full items-center text-left font-mono text-[10.5px] tabular-nums",
          "text-muted-foreground enabled:hover:bg-muted/50 enabled:hover:text-foreground disabled:opacity-50",
          hovered &&
            "shadow-[inset_0_0_0_1px_var(--selection)]",
          dimmed && !hovered && "opacity-25",
        )}
      >
        {count} {count === 1 ? "file" : "files"} {label}
      </button>
      <Handle
        id={handle}
        type="source"
        position={Position.Right}
        style={ANCHOR_STYLE}
        isConnectable={false}
      />
    </li>
  );
}
