import type { Edge, Node } from "@xyflow/react";

import type { Box } from "@/lib/graph/layout";
import type { Selection } from "@/lib/graph/selection";
import {
  ABOVE_HANDLE,
  BELOW_HANDLE,
  endpointKey,
  type Endpoint,
  type MapView,
  type PanelObject,
} from "@/lib/graph/view";
import { kindToneOfPath } from "@/lib/workspace/kinds";

export type ModuleNodeData = {
  label: string;
  directory: string;
  fileCount: number;
  fanIn: number;
  fanOut: number;
  /** Files inside in the focused category, or null when none is focused. */
  matched: number | null;
  selected: boolean;
  dimmed: boolean;
};

export type PanelRowData = {
  path: string;
  label: string;
  fanIn: number;
  fanOut: number;
  tone: number | null;
  selected: boolean;
  dimmed: boolean;
};

export type ModulePanelData = {
  label: string;
  directory: string;
  fileCount: number;
  fanIn: number;
  fanOut: number;
  /** Files inside in the focused category, or null when none is focused. */
  matched: number | null;
  rows: PanelRowData[];
  scrolls: boolean;
  offset: number;
  above: number;
  below: number;
  selected: boolean;
  dimmed: boolean;
  aboveDimmed: boolean;
  belowDimmed: boolean;
};

export type ModuleFlowNode = Node<ModuleNodeData, "module">;
export type PanelFlowNode = Node<ModulePanelData, "panel">;
export type FlowModuleNode = ModuleFlowNode | PanelFlowNode;

interface Highlight {
  endpoints: ReadonlySet<string>;
  objects: ReadonlySet<string>;
  incoming: ReadonlySet<string>;
  outgoing: ReadonlySet<string>;
}

const NEUTRAL_EDGE = "var(--edge)";
const INCOMING_EDGE = "var(--incoming)";
const OUTGOING_EDGE = "var(--outgoing)";
const DIM_EDGE_OPACITY = 0.15;

/**
 * What the canvas draws for a selection. Hover is deliberately not an input:
 * it lives in context besides this, so moving the pointer never asks React
 * Flow to diff a new node and edge list.
 */
export function buildFlowGraph({
  view,
  boxes,
  selection,
  category,
  categoryOfPath,
}: {
  view: MapView;
  boxes: ReadonlyMap<string, Box>;
  selection: Selection;
  /** The rail category being focused, if any. */
  category: string | null;
  /** The rail category each file belongs to, by path. */
  categoryOfPath: ReadonlyMap<string, string>;
}): { nodes: FlowModuleNode[]; edges: Edge[] } {
  const highlight = highlightFor(view, selection);
  const focus = categoryFocus(view, category, categoryOfPath);
  const nodes = view.objects.map((object): FlowModuleNode => {
    const box = boxes.get(object.id);
    if (!box) {
      throw new Error(`No layout box for ${object.id}`);
    }

    if (object.kind === "folded") {
      const matched =
        focus === null ? null : (focus.counts.get(object.id) ?? 0);
      const inCategory = focus === null || (matched ?? 0) > 0;
      const inSelection =
        highlight === null ||
        highlight.objects.has(object.id) ||
        highlight.endpoints.has(endpointKey(object.id, null));
      return {
        id: object.id,
        type: "module",
        position: { x: box.x, y: box.y },
        style: { width: box.width, height: box.height },
        // The layout already knows the box. Handing it over as measured keeps
        // React Flow from blanking edges while it re-measures a new node
        // object after a selection change.
        measured: { width: box.width, height: box.height },
        data: {
          label: object.label,
          directory: object.directory,
          fileCount: object.fileCount,
          fanIn: object.fanIn,
          fanOut: object.fanOut,
          matched,
          selected: selection?.kind === "node" && selection.id === object.id,
          dimmed: !inCategory || !inSelection,
        },
        draggable: false,
        selectable: false,
        connectable: false,
        focusable: false,
        zIndex: selection?.kind === "node" && selection.id === object.id ? 10 : 0,
      };
    }

    return panelNode(object, box, selection, highlight, focus);
  });

  const dim: Edge[] = [];
  const bright: Edge[] = [];

  for (const edge of view.edges) {
    const incoming = highlight?.incoming.has(edge.id) ?? false;
    const outgoing = highlight?.outgoing.has(edge.id) ?? false;
    const stroke = incoming
      ? INCOMING_EDGE
      : outgoing
        ? OUTGOING_EDGE
        : NEUTRAL_EDGE;
    // An edge stays bright when it touches the focused category. Both ends
    // outside it means the line belongs to the part being dimmed.
    const inCategory =
      focus === null ||
      focus.endpoints.has(
        endpointKey(edge.source, edge.sourceHandle),
      ) ||
      focus.endpoints.has(
        endpointKey(edge.target, edge.targetHandle),
      );
    const inSelection =
      highlight === null || incoming || outgoing;
    const styled: Edge = {
      id: edge.id,
      source: edge.source,
      sourceHandle: edge.sourceHandle ?? undefined,
      target: edge.target,
      targetHandle: edge.targetHandle ?? undefined,
      type: "default",
      style: {
        stroke,
        // Thickness says how many imports one line stands for, gently.
        strokeWidth: Math.min(
          2.5,
          1 + Math.log2(edge.count) / 3,
        ),
        opacity: inCategory && inSelection ? 1 : DIM_EDGE_OPACITY,
      },
      selectable: false,
      focusable: false,
    };

    if (incoming || outgoing) {
      bright.push(styled);
    } else {
      dim.push(styled);
    }
  }

  // Bright edges are drawn last so they cross over the dim ones. Order, not
  // zIndex: a raised edge would also draw over the nodes.
  return { nodes, edges: [...dim, ...bright] };
}

function panelNode(
  object: PanelObject,
  box: Box,
  selection: Selection,
  highlight: Highlight | null,
  focus: CategoryFocus | null,
): PanelFlowNode {
  const selected = selection?.kind === "node" && selection.id === object.id;
  const whole = highlight === null || highlight.objects.has(object.id);
  const lit = (handle: string): boolean =>
    whole ||
    (highlight?.endpoints.has(endpointKey(object.id, handle)) ?? false);
  const anyLit =
    whole ||
    object.rows.some((row) => lit(row.path)) ||
    (object.scrolls &&
      (lit(ABOVE_HANDLE) || lit(BELOW_HANDLE)));
  const matched =
    focus === null ? null : (focus.counts.get(object.id) ?? 0);
  const inCategory = (handle: string): boolean =>
    focus === null ||
    focus.endpoints.has(endpointKey(object.id, handle));

  return {
    id: object.id,
    type: "panel",
    position: { x: box.x, y: box.y },
    style: { width: box.width, height: box.height },
    measured: { width: box.width, height: box.height },
    data: {
      label: object.label,
      directory: object.directory,
      fileCount: object.fileCount,
      fanIn: object.fanIn,
      fanOut: object.fanOut,
      matched,
      scrolls: object.scrolls,
      offset: object.offset,
      above: object.above,
      below: object.below,
      rows: object.rows.map((row) => {
        const rowSelected =
          selection?.kind === "file" && selection.path === row.path;
        return {
          path: row.path,
          label: row.label,
          fanIn: row.fanIn,
          fanOut: row.fanOut,
          tone: kindToneOfPath(row.path),
          selected: rowSelected,
          dimmed:
            !inCategory(row.path) ||
            (highlight !== null && !rowSelected && !lit(row.path)),
        };
      }),
      selected,
      dimmed:
        (focus !== null && (matched ?? 0) === 0) ||
        (highlight !== null && !anyLit),
      aboveDimmed:
        !inCategory(ABOVE_HANDLE) ||
        (highlight !== null && !lit(ABOVE_HANDLE)),
      belowDimmed:
        !inCategory(BELOW_HANDLE) ||
        (highlight !== null && !lit(BELOW_HANDLE)),
    },
    draggable: false,
    selectable: false,
    connectable: false,
    focusable: false,
    zIndex: selected ? 10 : 0,
  };
}

interface CategoryFocus {
  /** Endpoint keys standing for at least one file in the category. */
  endpoints: ReadonlySet<string>;
  /** Per canvas object, how many of its files are in the category. */
  counts: ReadonlyMap<string, number>;
}

// Every file is counted once, against whatever stands for it on the canvas, so
// the objects' counts add up to the rail's.
function categoryFocus(
  view: MapView,
  category: string | null,
  categoryOfPath: ReadonlyMap<string, string>,
): CategoryFocus | null {
  if (category === null) {
    return null;
  }

  const endpoints = new Set<string>();
  const counts = new Map<string, number>();

  for (const [path, at] of view.endpointOf) {
    if (categoryOfPath.get(path) !== category) {
      continue;
    }
    endpoints.add(endpointKey(at.object, at.handle));
    counts.set(at.object, (counts.get(at.object) ?? 0) + 1);
  }

  return { endpoints, counts };
}

function highlightFor(
  view: MapView,
  selection: Selection,
): Highlight | null {
  if (!selection) {
    return null;
  }

  const endpoints = new Set<string>();
  const objects = new Set<string>();
  const incoming = new Set<string>();
  const outgoing = new Set<string>();

  if (selection.kind === "node") {
    objects.add(selection.id);
    for (const edge of view.edges) {
      if (edge.target === selection.id) {
        incoming.add(edge.id);
        endpoints.add(
          endpointKey(edge.source, edge.sourceHandle),
        );
      }
      if (edge.source === selection.id) {
        outgoing.add(edge.id);
        endpoints.add(
          endpointKey(edge.target, edge.targetHandle),
        );
      }
    }
    return { endpoints, objects, incoming, outgoing };
  }

  const at = view.endpointOf.get(selection.path);
  if (!at) {
    return null;
  }
  const self = endpointKey(at.object, at.handle);
  endpoints.add(self);
  // Neighbours come from the file edges rather than the drawn ones, so a
  // connection to a row inside the same panel still lights up.
  for (const neighbor of view.neighborsOf.get(selection.path) ?? []) {
    endpoints.add(neighbor);
  }

  for (const edge of view.edges) {
    if (endpointKey(edge.target, edge.targetHandle) === self) {
      incoming.add(edge.id);
    }
    if (endpointKey(edge.source, edge.sourceHandle) === self) {
      outgoing.add(edge.id);
    }
  }

  return { endpoints, objects, incoming, outgoing };
}

/**
 * The one endpoint on the canvas that stands for a hovered file or folder: its
 * row, the above/below row it's scrolled into, or the folded node holding it.
 */
export function hoveredEndpoint(
  view: MapView,
  hover: Selection,
): Endpoint | null {
  if (!hover) {
    return null;
  }
  if (hover.kind === "node") {
    return { object: hover.id, handle: null };
  }
  return view.endpointOf.get(hover.path) ?? null;
}
