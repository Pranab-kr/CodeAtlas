import { MarkerType, type Edge, type Node } from "@xyflow/react";

import type { FilePair, FoldedModule, FoldResult } from "@/lib/graph/fold";
import type { ModuleLayout } from "@/lib/graph/layout";
import { categoryKeyOfPath } from "@/lib/workspace/categories";

export type GraphFocus =
  | { kind: "node"; id: string }
  | { kind: "file"; nodeId: string; path: string }
  | null;

export type ModuleNodeData = {
  label: string;
  directory: string;
  fileCount: number;
  fanIn: number;
  fanOut: number;
  selected: boolean;
  dimmed: boolean;
};

export type PanelRowData = {
  path: string;
  label: string;
  inHandle: string;
  outHandle: string;
  fanIn: number;
  fanOut: number;
  tone: number;
  selected: boolean;
  dimmed: boolean;
};

export type ModulePanelData = {
  label: string;
  directory: string;
  fileCount: number;
  fanIn: number;
  fanOut: number;
  rows: PanelRowData[];
  selected: boolean;
  dimmed: boolean;
};

export type ModuleFlowNode = Node<ModuleNodeData, "module">;
export type PanelFlowNode = Node<ModulePanelData, "panel">;
export type FlowModuleNode = ModuleFlowNode | PanelFlowNode;

interface PanelModel {
  rows: Array<{
    path: string;
    label: string;
    inHandle: string;
    outHandle: string;
    fanIn: number;
    fanOut: number;
    tone: number;
  }>;
  handles: Map<string, { in: string; out: string }>;
}

interface RenderedEdge {
  key: string;
  source: string;
  target: string;
  sourceHandle: string;
  targetHandle: string;
  sourceModule: string;
  targetModule: string;
  files: FilePair[];
}

const NEUTRAL_EDGE = "var(--muted-foreground)";
const INCOMING_EDGE = "var(--incoming)";
const OUTGOING_EDGE = "var(--outgoing)";

export function buildFlowGraph({
  fold,
  layout,
  expanded,
  focus,
  tones,
  visibleFiles,
}: {
  fold: FoldResult;
  layout: ModuleLayout;
  expanded: ReadonlySet<string>;
  focus: GraphFocus;
  tones: ReadonlyMap<string, number>;
  visibleFiles?: ReadonlyMap<string, ReadonlySet<string>>;
}): { nodes: FlowModuleNode[]; edges: Edge[] } {
  const modulesById = new Map(
    fold.modules.map((module) => [module.id, module]),
  );
  const panels = new Map<string, PanelModel>();

  for (const entry of fold.modules) {
    if (expanded.has(entry.id)) {
      panels.set(entry.id, buildPanelModel(entry, tones));
    }
  }

  const renderedEdges = buildRenderedEdges(fold, panels, visibleFiles);
  const connectedModules = new Set<string>();
  const connectedFiles = new Set<string>();

  if (focus?.kind === "node") {
    connectedModules.add(focus.id);
  }
  if (focus?.kind === "file") {
    connectedModules.add(focus.nodeId);
    connectedFiles.add(focus.path);
  }

  for (const edge of renderedEdges) {
    if (edgeDirection(edge, focus) === null) {
      continue;
    }
    connectedModules.add(edge.sourceModule);
    connectedModules.add(edge.targetModule);
    for (const pair of edge.files) {
      connectedFiles.add(pair.source);
      connectedFiles.add(pair.target);
    }
  }

  const nodes: FlowModuleNode[] = layout.nodes.map((layoutNode) => {
    const entry = modulesById.get(layoutNode.id);
    if (!entry) {
      throw new Error(`Layout node has no module: ${layoutNode.id}`);
    }

    const selected =
      focus?.kind === "node" && focus.id === entry.id;
    const dimmed = focus !== null && !connectedModules.has(entry.id);
    const isOpen = expanded.has(entry.id);

    if (!isOpen) {
      return {
        id: entry.id,
        type: "module",
        position: { x: layoutNode.x, y: layoutNode.y },
        style: { width: layoutNode.width, height: layoutNode.height },
        data: {
          label: entry.label,
          directory: entry.directory,
          fileCount: entry.files.length,
          fanIn: entry.fanIn,
          fanOut: entry.fanOut,
          selected,
          dimmed,
        },
        draggable: false,
        selectable: false,
        connectable: false,
        focusable: false,
        zIndex: selected ? 10 : 0,
      };
    }

    const panel = panels.get(entry.id);
    if (!panel) {
      throw new Error(`Expanded module has no panel model: ${entry.id}`);
    }

    const rows: PanelRowData[] = panel.rows.map((row) => ({
      path: row.path,
      label: row.label,
      inHandle: row.inHandle,
      outHandle: row.outHandle,
      fanIn: row.fanIn,
      fanOut: row.fanOut,
      tone: row.tone,
      selected: focus?.kind === "file" && focus.path === row.path,
      dimmed: rowDimmed(entry, row.path, focus, connectedFiles),
    }));

    return {
      id: entry.id,
      type: "panel",
      position: { x: layoutNode.x, y: layoutNode.y },
      style: { width: layoutNode.width, height: layoutNode.height },
      data: {
        label: entry.label,
        directory: entry.directory,
        fileCount: entry.files.length,
        fanIn: entry.fanIn,
        fanOut: entry.fanOut,
        rows,
        selected,
        dimmed,
      },
      draggable: false,
      selectable: false,
      connectable: false,
      focusable: false,
      zIndex: selected ? 10 : 0,
    };
  });

  const edges: Edge[] = renderedEdges.map((edge, index) => {
    const direction = edgeDirection(edge, focus);
    const stroke =
      direction === "incoming"
        ? INCOMING_EDGE
        : direction === "outgoing"
          ? OUTGOING_EDGE
          : NEUTRAL_EDGE;
    const opacity =
      focus === null ? 0.3 : direction === null ? 0.14 : 1;

    return {
      id: `edge-${index}`,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      type: "default",
      style: { stroke, strokeWidth: 1, opacity },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: stroke,
        width: 10,
        height: 10,
      },
      selectable: false,
      focusable: false,
    };
  });

  return { nodes, edges };
}

function buildPanelModel(
  module: FoldedModule,
  tones: ReadonlyMap<string, number>,
): PanelModel {
  const sorted = [...module.files].sort((left, right) =>
    left.path.localeCompare(right.path),
  );
  const rows = sorted.map((file, index) => ({
    path: file.path,
    label: file.label,
    inHandle: `in-${index}`,
    outHandle: `out-${index}`,
    fanIn: file.fanIn,
    fanOut: file.fanOut,
    tone: tones.get(categoryKeyOfPath(file.path)) ?? 0,
  }));

  return {
    rows,
    handles: new Map(
      rows.map((row) => [
        row.path,
        { in: row.inHandle, out: row.outHandle },
      ]),
    ),
  };
}

function buildRenderedEdges(
  fold: FoldResult,
  panels: ReadonlyMap<string, PanelModel>,
  visibleFiles: ReadonlyMap<string, ReadonlySet<string>> | undefined,
): RenderedEdge[] {
  const grouped = new Map<string, RenderedEdge>();

  for (const moduleEdge of fold.edges) {
    const sourcePanel = panels.get(moduleEdge.source);
    const targetPanel = panels.get(moduleEdge.target);
    const sourceVisible = visibleFiles?.get(moduleEdge.source);
    const targetVisible = visibleFiles?.get(moduleEdge.target);

    for (const pair of moduleEdge.files) {
      if (sourcePanel && sourceVisible && !sourceVisible.has(pair.source)) {
        continue;
      }
      if (targetPanel && targetVisible && !targetVisible.has(pair.target)) {
        continue;
      }

      const sourceHandle = sourcePanel
        ? sourcePanel.handles.get(pair.source)?.out
        : "out";
      const targetHandle = targetPanel
        ? targetPanel.handles.get(pair.target)?.in
        : "in";

      if (!sourceHandle || !targetHandle) {
        throw new Error(
          `No handle for ${pair.source} -> ${pair.target}`,
        );
      }

      const key = `${moduleEdge.source}\u0000${sourceHandle}\u0000${moduleEdge.target}\u0000${targetHandle}`;
      let rendered = grouped.get(key);
      if (!rendered) {
        rendered = {
          key,
          source: moduleEdge.source,
          target: moduleEdge.target,
          sourceHandle,
          targetHandle,
          sourceModule: moduleEdge.source,
          targetModule: moduleEdge.target,
          files: [],
        };
        grouped.set(key, rendered);
      }
      rendered.files.push(pair);
    }
  }

  return [...grouped.values()].sort((left, right) =>
    left.key.localeCompare(right.key),
  );
}

function rowDimmed(
  module: FoldedModule,
  path: string,
  focus: GraphFocus,
  connectedFiles: ReadonlySet<string>,
): boolean {
  if (!focus) {
    return false;
  }
  if (focus.kind === "node" && focus.id === module.id) {
    return false;
  }
  if (focus.kind === "file" && focus.path === path) {
    return false;
  }
  return !connectedFiles.has(path);
}

function edgeDirection(
  edge: RenderedEdge,
  focus: GraphFocus,
): "incoming" | "outgoing" | null {
  if (!focus) {
    return null;
  }

  if (focus.kind === "node") {
    if (edge.targetModule === focus.id) {
      return "incoming";
    }
    if (edge.sourceModule === focus.id) {
      return "outgoing";
    }
    return null;
  }

  let incoming = false;
  let outgoing = false;
  for (const pair of edge.files) {
    if (pair.target === focus.path) {
      incoming = true;
    }
    if (pair.source === focus.path) {
      outgoing = true;
    }
  }

  return incoming ? "incoming" : outgoing ? "outgoing" : null;
}
