import dagre from "@dagrejs/dagre";

import { MAX_ROWS, type MapEdge, type MapObject } from "./view.ts";

// Sizes are fixed px, not rem: dagre lays out in the same units React Flow
// draws in, and the zoom does the scaling. The node components read these
// constants so the box drawn is the box laid out.
export const CHAR_WIDTH = 7.2;
export const PAD_X = 11;
export const PANEL_HEADER_HEIGHT = 44;
export const PANEL_ROW_HEIGHT = 22;
const ROW_NUMBERS_WIDTH = 88;
const PANEL_MIN_WIDTH = 220;
const PANEL_MAX_WIDTH = 460;
const FOLDED_MIN_WIDTH = 132;
const FOLDED_MIN_HEIGHT = 44;
const FOLDED_MAX_HEIGHT = 180;
const FAN_IN_SCALE = 6;
const NODE_SEP = 6;
const RANK_SEP = 24;

export type Box = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Height carries fan-in; sqrt so one hub doesn't flatten everything else into
 * the minimum. Width comes from the label alone, so a long name doesn't read
 * as an important file.
 */
export function sizeOf(object: MapObject): {
  width: number;
  height: number;
} {
  const labelWidth = object.label.length * CHAR_WIDTH + 2 * PAD_X;

  if (object.kind === "folded") {
    return {
      width: Math.ceil(Math.max(FOLDED_MIN_WIDTH, labelWidth)),
      height: Math.round(
        Math.min(
          FOLDED_MAX_HEIGHT,
          FOLDED_MIN_HEIGHT + FAN_IN_SCALE * Math.sqrt(object.fanIn),
        ),
      ),
    };
  }

  const widest = Math.max(
    labelWidth,
    object.rowChars * CHAR_WIDTH + 2 * PAD_X + ROW_NUMBERS_WIDTH,
  );
  // A scrolling panel always keeps its above and below strips, so its height
  // is the same at every offset and scrolling never changes the layout.
  const rowCount = object.scrolls
    ? MAX_ROWS + 2
    : object.rows.length;

  return {
    width: Math.ceil(
      Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, widest)),
    ),
    height: PANEL_HEADER_HEIGHT + rowCount * PANEL_ROW_HEIGHT,
  };
}

/**
 * Deterministic: objects and edges arrive sorted, and dagre has no randomness,
 * so the same data and the same open set give the same picture.
 */
export function layoutMap(
  objects: readonly MapObject[],
  edges: readonly MapEdge[],
): Map<string, Box> {
  const graph = new dagre.graphlib.Graph<
    { rankdir: "LR"; nodesep: number; ranksep: number },
    { width: number; height: number; x?: number; y?: number },
    object
  >();
  graph.setGraph({ rankdir: "LR", nodesep: NODE_SEP, ranksep: RANK_SEP });
  graph.setDefaultEdgeLabel(() => ({}));

  for (const object of objects) {
    graph.setNode(object.id, sizeOf(object));
  }

  // Every import is drawn, but the layout only needs a backbone. Feeding all
  // of them to dagre inserts a dummy node per long edge and the graph zooms
  // out until nothing is readable. The strongest connections keep the same
  // organic left-to-right shape at a legible scale.
  for (const edge of layoutEdges(objects, edges)) {
    graph.setEdge(edge.source, edge.target);
  }

  dagre.layout(graph);

  const boxes = new Map<string, Box>();
  for (const object of objects) {
    const node = graph.node(object.id);
    if (node.x === undefined || node.y === undefined) {
      throw new Error(`Layout gave ${object.id} no position`);
    }
    // dagre positions centres; React Flow positions top-left corners.
    boxes.set(object.id, {
      x: node.x - node.width / 2,
      y: node.y - node.height / 2,
      width: node.width,
      height: node.height,
    });
  }

  return boxes;
}

function layoutEdges(
  objects: readonly MapObject[],
  edges: readonly MapEdge[],
): MapEdge[] {
  // Row handles split one module connection into several lines; for layout
  // they are the same constraint, so sum them back together first.
  const byPair = new Map<string, MapEdge>();
  for (const edge of edges) {
    const key = `${edge.source}>${edge.target}`;
    const existing = byPair.get(key);
    if (existing) {
      existing.count += edge.count;
    } else {
      byPair.set(key, { ...edge });
    }
  }

  const ordered = [...byPair.values()].sort(
    (left, right) =>
      right.count - left.count || left.id.localeCompare(right.id),
  );
  const picked = new Map<string, MapEdge>();
  const keyOf = (edge: MapEdge): string =>
    `${edge.source}>${edge.target}`;

  for (const edge of ordered) {
    if (picked.size >= objects.length) {
      break;
    }
    picked.set(keyOf(edge), edge);
  }

  // Nodes the strongest connections don't reach still get laid out by dagre;
  // they sit on the first rank and keep their real edges drawn on top.
  return [...picked.values()];
}

export function boundsOf(boxes: ReadonlyMap<string, Box>): Box {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const box of boxes.values()) {
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.width);
    maxY = Math.max(maxY, box.y + box.height);
  }

  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}
