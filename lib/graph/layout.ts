import type { FoldedModule, FoldResult } from "./fold.ts";

export const PANEL_WIDTH = 264;
export const PANEL_MAX_ROWS = 12;
export const PANEL_HEADER_HEIGHT = 40;
export const PANEL_ROW_HEIGHT = 22;
export const PANEL_FRAME = 2;
export const PANEL_STRIP_HEIGHT = 16;

const NODE_MIN_WIDTH = 52;
const NODE_CHAR_WIDTH = 6.8;
const NODE_META_CHAR_WIDTH = 5.9;
const NODE_TEXT_PADDING = 24;
const NODE_BASE_HEIGHT = 46;
const NODE_FAN_IN_FACTOR = 3.5;

const GRID_COLUMNS = 6;
const GRID_WIDTH = 900;
const GRID_HEIGHT = 760;
const GRID_JITTER = 0.35;
const GRID_SEED = 41;
const OVERLAP_PADDING = 14;

export interface ModuleLayoutNode {
  id: string;
  width: number;
  height: number;
  x: number;
  y: number;
}

export interface ModuleLayout {
  nodes: ModuleLayoutNode[];
  bounds: { x: number; y: number; width: number; height: number };
}

interface LayoutNode {
  id: string;
  width: number;
  height: number;
  x: number;
  y: number;
}

interface GridSlot {
  x: number;
  y: number;
  distance: number;
}

const EMPTY_EXPANDED: ReadonlySet<string> = new Set<string>();

/**
 * Modules are placed on an importance grid: the most connected modules take
 * the centre slots, leaf modules take the edges. The canvas is used evenly
 * instead of the graph collapsing into a central blob.
 *
 * When a panel opens, the other nodes keep their grid positions and only
 * overlapping neighbours are pushed apart. The graph does not re-simulate.
 */
export function layoutModules(
  fold: FoldResult,
  expanded: ReadonlySet<string>,
): ModuleLayout {
  const modules = [...fold.modules].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const closed = gridLayout(modules);

  if (expanded.size === 0) {
    return toLayout(closed);
  }

  const closedById = new Map(closed.map((node) => [node.id, node]));
  const nodes: LayoutNode[] = modules.map((module) => {
    const size = moduleSize(module, expanded);
    const anchor = closedById.get(module.id);
    return {
      id: module.id,
      width: size.width,
      height: size.height,
      x: anchor?.x ?? 0,
      y: anchor?.y ?? 0,
    };
  });

  resolveOverlaps(nodes, 80);
  center(nodes);

  return toLayout(nodes);
}

function gridLayout(modules: readonly FoldedModule[]): LayoutNode[] {
  const nodes: LayoutNode[] = modules.map((module) => {
    const size = moduleSize(module, EMPTY_EXPANDED);
    return {
      id: module.id,
      width: size.width,
      height: size.height,
      x: 0,
      y: 0,
    };
  });
  const rows = Math.ceil(nodes.length / GRID_COLUMNS);
  const cellWidth = GRID_WIDTH / GRID_COLUMNS;
  const cellHeight = GRID_HEIGHT / rows;
  const slots: GridSlot[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < GRID_COLUMNS; column += 1) {
      const x =
        (column + 0.5) * cellWidth - GRID_WIDTH / 2;
      const y =
        (row + 0.5) * cellHeight - GRID_HEIGHT / 2;
      slots.push({ x, y, distance: Math.hypot(x, y) });
    }
  }
  slots.sort(
    (left, right) =>
      left.distance - right.distance ||
      left.y - right.y ||
      left.x - right.x,
  );

  const byId = new Map(modules.map((module) => [module.id, module]));
  const ranked = [...nodes].sort((left, right) => {
    const leftModule = byId.get(left.id);
    const rightModule = byId.get(right.id);
    const leftImportance =
      (leftModule?.fanIn ?? 0) + (leftModule?.fanOut ?? 0);
    const rightImportance =
      (rightModule?.fanIn ?? 0) + (rightModule?.fanOut ?? 0);
    return (
      rightImportance - leftImportance ||
      left.id.localeCompare(right.id)
    );
  });
  const random = seededRandom(GRID_SEED);

  ranked.forEach((node, index) => {
    const slot = slots[index];
    if (!slot) {
      return;
    }
    node.x =
      slot.x + (random() - 0.5) * cellWidth * GRID_JITTER;
    node.y =
      slot.y + (random() - 0.5) * cellHeight * GRID_JITTER;
  });

  resolveOverlaps(nodes, 120);
  center(nodes);

  return nodes;
}

function resolveOverlaps(nodes: LayoutNode[], iterations: number): void {
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    let moved = false;

    for (let left = 0; left < nodes.length; left += 1) {
      for (let right = left + 1; right < nodes.length; right += 1) {
        const a = nodes[left];
        const b = nodes[right];
        const overlapX =
          (a.width + b.width) / 2 +
          OVERLAP_PADDING -
          Math.abs(a.x - b.x);
        const overlapY =
          (a.height + b.height) / 2 +
          OVERLAP_PADDING -
          Math.abs(a.y - b.y);

        if (overlapX <= 0 || overlapY <= 0) {
          continue;
        }

        moved = true;
        if (overlapX < overlapY) {
          const push = (overlapX / 2) * (a.x < b.x ? -1 : 1);
          a.x += push;
          b.x -= push;
        } else {
          const push = (overlapY / 2) * (a.y < b.y ? -1 : 1);
          a.y += push;
          b.y -= push;
        }
      }
    }

    if (!moved) {
      break;
    }
  }
}

function center(nodes: readonly LayoutNode[]): void {
  const bounds = boundsOf(nodes);
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;

  for (const node of nodes) {
    node.x -= centerX;
    node.y -= centerY;
  }
}

function boundsOf(nodes: readonly LayoutNode[]): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const minX = Math.min(...nodes.map((node) => node.x - node.width / 2));
  const minY = Math.min(...nodes.map((node) => node.y - node.height / 2));
  const maxX = Math.max(...nodes.map((node) => node.x + node.width / 2));
  const maxY = Math.max(...nodes.map((node) => node.y + node.height / 2));

  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

function toLayout(nodes: readonly LayoutNode[]): ModuleLayout {
  const layoutNodes: ModuleLayoutNode[] = nodes
    .map((node) => ({
      id: node.id,
      width: node.width,
      height: node.height,
      x: node.x - node.width / 2,
      y: node.y - node.height / 2,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  const minX = Math.min(...layoutNodes.map((node) => node.x));
  const minY = Math.min(...layoutNodes.map((node) => node.y));
  const maxX = Math.max(...layoutNodes.map((node) => node.x + node.width));
  const maxY = Math.max(...layoutNodes.map((node) => node.y + node.height));

  return {
    nodes: layoutNodes,
    bounds: {
      x: minX,
      y: minY,
      width: Math.max(1, maxX - minX),
      height: Math.max(1, maxY - minY),
    },
  };
}

function moduleSize(
  module: FoldedModule,
  expanded: ReadonlySet<string>,
): { width: number; height: number } {
  if (expanded.has(module.id)) {
    return {
      width: PANEL_WIDTH,
      height: panelHeight(module.files.length),
    };
  }

  const meta = `${module.files.length} files  ←${module.fanIn} ${module.fanOut}→`;

  return {
    width: Math.max(
      NODE_MIN_WIDTH,
      Math.ceil(
        Math.max(
          module.label.length * NODE_CHAR_WIDTH,
          meta.length * NODE_META_CHAR_WIDTH,
        ),
      ) + NODE_TEXT_PADDING,
    ),
    height: Math.round(
      NODE_BASE_HEIGHT + Math.log2(module.fanIn + 1) * NODE_FAN_IN_FACTOR,
    ),
  };
}

function panelHeight(fileCount: number): number {
  const listRows = Math.min(fileCount, PANEL_MAX_ROWS);
  const strips =
    fileCount > PANEL_MAX_ROWS ? PANEL_STRIP_HEIGHT * 2 : 0;
  return (
    PANEL_FRAME +
    PANEL_HEADER_HEIGHT +
    listRows * PANEL_ROW_HEIGHT +
    strips
  );
}

function seededRandom(initialSeed: number): () => number {
  let seed = initialSeed >>> 0;
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
