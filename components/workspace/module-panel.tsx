"use client";

import {
  Handle,
  Position,
  useUpdateNodeInternals,
  type NodeProps,
} from "@xyflow/react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import {
  PANEL_MAX_ROWS,
  PANEL_ROW_HEIGHT,
  PANEL_STRIP_HEIGHT,
} from "@/lib/graph/layout";
import { cn } from "@/lib/utils";

import { useGraphActions } from "./graph-actions";
import type { PanelFlowNode } from "./graph-model";

const HIDDEN_HANDLE_STYLE: CSSProperties = {
  width: 1,
  height: 1,
  minWidth: 0,
  minHeight: 0,
  opacity: 0,
  border: 0,
  background: "transparent",
};

const STRIP_STYLE: CSSProperties = {
  height: PANEL_STRIP_HEIGHT,
};

export function ModulePanel({ id, data }: NodeProps<PanelFlowNode>) {
  const { closeModule, selectFile, reportVisibleFiles } =
    useGraphActions();
  const updateNodeInternals = useUpdateNodeInternals();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollRange, setScrollRange] = useState(() => ({
    start: 0,
    end: Math.min(data.rows.length, PANEL_MAX_ROWS),
  }));

  const reportVisible = useCallback(() => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }

    const centre = PANEL_ROW_HEIGHT / 2;
    const start = Math.max(
      0,
      Math.ceil((element.scrollTop - centre) / PANEL_ROW_HEIGHT),
    );
    const end = Math.min(
      data.rows.length,
      Math.floor(
        (element.scrollTop + element.clientHeight - centre) /
          PANEL_ROW_HEIGHT,
      ) + 1,
    );

    setScrollRange((previous) =>
      previous.start === start && previous.end === end
        ? previous
        : { start, end },
    );
    reportVisibleFiles(
      id,
      new Set(
        data.rows.slice(start, end).map((row) => row.path),
      ),
    );
  }, [data.rows, id, reportVisibleFiles]);

  useEffect(() => {
    reportVisible();
  }, [reportVisible]);

  const hasHiddenRows = data.rows.length > PANEL_MAX_ROWS;
  const above = scrollRange.start;
  const below = data.rows.length - scrollRange.end;

  return (
    <div
      className={cn(
        "nopan flex h-full w-full select-none flex-col overflow-hidden rounded-[3px] border bg-card",
        data.selected ? "border-selection" : "border-border",
        data.dimmed && "opacity-20",
      )}
    >
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          closeModule(id);
        }}
        title={`Close ${data.directory}`}
        className={cn(
          "flex h-10 shrink-0 cursor-pointer flex-col justify-center gap-1 border-b border-border px-2 text-left",
          data.selected
            ? "bg-selection/[0.06] hover:bg-selection/10"
            : "bg-muted/30 hover:bg-muted/50",
          "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-selection",
        )}
      >
        <span className="flex w-full items-center gap-2">
          <span className="min-w-0 truncate font-mono text-[11px] leading-none">
            {data.label}
          </span>
          <span className="ml-auto shrink-0 font-mono text-[9.5px] leading-none text-muted-foreground tabular-nums">
            {data.fileCount} files
          </span>
          <span
            aria-hidden
            className="shrink-0 font-mono text-[12px] leading-none text-muted-foreground"
          >
            ×
          </span>
        </span>
        <span className="flex w-full items-center gap-2 font-mono text-[9.5px] leading-none tabular-nums">
          <span className="text-incoming" aria-hidden>
            ←{data.fanIn}
          </span>
          <span className="text-outgoing" aria-hidden>
            {data.fanOut}→
          </span>
          <span className="sr-only">
            {data.fanIn} incoming, {data.fanOut} outgoing
          </span>
        </span>
        <span className="sr-only">close panel</span>
      </button>
      {hasHiddenRows && above > 0 ? (
        <div
          style={STRIP_STYLE}
          className="nowheel flex shrink-0 items-center justify-center border-b border-border/60 bg-muted/20 font-mono text-[8.5px] leading-none text-muted-foreground"
        >
          ↑ {above} files above
        </div>
      ) : null}
      <div
        ref={scrollRef}
        className="nowheel flex min-h-0 flex-1 flex-col overflow-y-auto [scrollbar-color:var(--border)_transparent] [scrollbar-width:thin]"
        onScroll={() => {
          reportVisible();
          updateNodeInternals(id);
        }}
      >
        {data.rows.map((row) => (
          <div
            key={row.path}
            className={cn(
              "relative flex h-[22px] shrink-0 items-center",
              row.dimmed && "opacity-20",
            )}
          >
            <Handle
              type="target"
              position={Position.Left}
              id={row.inHandle}
              style={HIDDEN_HANDLE_STYLE}
            />
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                selectFile(row.path);
              }}
              aria-pressed={row.selected}
              title={row.path}
              className={cn(
                "flex h-full w-full min-w-0 cursor-pointer items-center gap-2 px-2 text-left font-mono text-[10.5px]",
                row.selected
                  ? "bg-selection/10 text-foreground shadow-[inset_2px_0_0_var(--selection)]"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-selection",
              )}
            >
              <span
                aria-hidden
                className="size-1.5 shrink-0 rounded-[1px]"
                style={{
                  backgroundColor: `var(--kind-${row.tone + 1})`,
                }}
              />
              <span className="min-w-0 truncate">{row.label}</span>
              <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[9px] tabular-nums">
                <span className="text-incoming" aria-hidden>
                  ←{row.fanIn}
                </span>
                <span className="text-outgoing" aria-hidden>
                  {row.fanOut}→
                </span>
                <span className="sr-only">
                  {row.fanIn} incoming, {row.fanOut} outgoing
                </span>
              </span>
            </button>
            <Handle
              type="source"
              position={Position.Right}
              id={row.outHandle}
              style={HIDDEN_HANDLE_STYLE}
            />
          </div>
        ))}
      </div>
      {hasHiddenRows && below > 0 ? (
        <div
          style={STRIP_STYLE}
          className="nowheel flex shrink-0 items-center justify-center border-t border-border/60 bg-muted/20 font-mono text-[8.5px] leading-none text-muted-foreground"
        >
          ↓ {below} files below
        </div>
      ) : null}
    </div>
  );
}
