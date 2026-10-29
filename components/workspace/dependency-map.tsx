"use client";

import {
  Background,
  BackgroundVariant,
  ReactFlow,
  ReactFlowProvider,
  getViewportForBounds,
  useReactFlow,
  useStore,
  useStoreApi,
  type Edge,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { FoldResult } from "@/lib/graph/fold";
import { boundsOf, layoutMap } from "@/lib/graph/layout";
import type { Selection } from "@/lib/graph/selection";
import { buildView } from "@/lib/graph/view";
import type { ParsedEdge } from "@/lib/parser/types";
import { cn } from "@/lib/utils";

import {
  GraphActionsProvider,
  type GraphActions,
} from "./graph-actions";
import {
  MapHoverProvider,
  type MapHover,
} from "./graph-hover";
import {
  buildFlowGraph,
  hoveredEndpoint,
  type FlowModuleNode,
} from "./graph-model";
import { ModuleNode } from "./module-node";
import { ModulePanel } from "./module-panel";

const nodeTypes = { module: ModuleNode, panel: ModulePanel };

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 2;
/** Initial fit may enlarge a small graph a little, never to poster size. */
const INITIAL_MAX_ZOOM = 1.25;
const FIT_PADDING = 0.06;

export interface DependencyMapProps {
  edges: readonly ParsedEdge[];
  fold: FoldResult;
  /** Open modules and how far each has been scrolled. */
  open: ReadonlyMap<string, number>;
  selection: Selection;
  /** Whatever the pointer is over, here or in the pane. */
  hover: Selection;
  /** Changes whenever an open should refit the view to the new layout. */
  refit: number;
  onOpen(id: string): void;
  onClose(id: string): void;
  onSelectFile(path: string): void;
  onScroll(id: string, offset: number): void;
  onHover(selection: Selection): void;
  onDeselect(): void;
}

export function DependencyMap(props: DependencyMapProps) {
  return (
    <ReactFlowProvider>
      <GraphCanvas {...props} />
    </ReactFlowProvider>
  );
}

function GraphCanvas({
  edges,
  fold,
  open,
  selection,
  hover,
  refit,
  onOpen,
  onClose,
  onSelectFile,
  onScroll,
  onHover,
  onDeselect,
}: DependencyMapProps) {
  const [ready, setReady] = useState(false);

  const expanded = useMemo(
    () => new Set<string>(open.keys()),
    [open],
  );
  const view = useMemo(
    () => buildView(fold, edges, expanded, open),
    [fold, edges, expanded, open],
  );
  const boxes = useMemo(
    () => layoutMap(view.objects, view.edges),
    [view],
  );
  const graph = useMemo(
    () => buildFlowGraph({ view, boxes, selection }),
    [view, boxes, selection],
  );
  const mapHover = useMemo<MapHover>(
    () => ({
      selection: hover,
      endpoint: hoveredEndpoint(view, hover),
    }),
    [view, hover],
  );

  const { getZoom, setViewport } = useReactFlow();
  const store = useStoreApi();
  const viewportReady = useStore(
    (state) => state.width > 0 && state.height > 0,
  );

  const refitted = useRef(refit);

  const fitInitial = useCallback(() => {
    setReady(true);
    const { width, height } = store.getState();
    if (!width || !height) {
      return;
    }
    void setViewport(
      getViewportForBounds(
        boundsOf(boxes),
        width,
        height,
        MIN_ZOOM,
        INITIAL_MAX_ZOOM,
        FIT_PADDING,
      ),
    );
  }, [boxes, setViewport, store]);

  // Refit after an open, against the layout that open produced. The caller
  // bumps `refit` in the same update as `open`, so by the time this sees a new
  // value the boxes are already the new ones, never the state before.
  useEffect(() => {
    if (!viewportReady || refit === 0 || refitted.current === refit) {
      return;
    }
    refitted.current = refit;

    const { width, height } = store.getState();
    if (!width || !height) {
      return;
    }
    // Capping at the current zoom means this can only ever zoom out.
    void setViewport(
      getViewportForBounds(
        boundsOf(boxes),
        width,
        height,
        MIN_ZOOM,
        getZoom(),
        FIT_PADDING,
      ),
    );
  }, [viewportReady, refit, boxes, getZoom, setViewport, store]);

  const actions = useMemo<GraphActions>(
    () => ({
      openModule: onOpen,
      closeModule: onClose,
      selectFile: onSelectFile,
      scroll: onScroll,
      clearSelection: onDeselect,
      hover: onHover,
    }),
    [
      onOpen,
      onClose,
      onSelectFile,
      onScroll,
      onDeselect,
      onHover,
    ],
  );

  // React Flow only enables pointer events on a node when one of its own
  // handlers is present. The custom buttons handle the actual actions.
  const handleNodeClick: NodeMouseHandler<FlowModuleNode> = useCallback(
    (_event, node) => {
      if (node.type === "module") {
        onOpen(node.id);
      }
    },
    [onOpen],
  );

  return (
    <GraphActionsProvider actions={actions}>
      <MapHoverProvider hover={mapHover}>
        <ReactFlow<FlowModuleNode, Edge>
          nodes={graph.nodes}
          edges={graph.edges}
          nodeTypes={nodeTypes}
          onNodeClick={handleNodeClick}
          onInit={fitInitial}
          onPaneClick={onDeselect}
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
          nodesDraggable={false}
          nodesConnectable={false}
          nodesFocusable={false}
          edgesFocusable={false}
          elementsSelectable={false}
          elevateNodesOnSelect={false}
          deleteKeyCode={null}
          zoomOnDoubleClick={false}
          className={cn(
            "h-full w-full",
            ready ? "opacity-100" : "opacity-0",
          )}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={18}
            size={1}
            color="var(--border)"
          />
        </ReactFlow>
      </MapHoverProvider>
    </GraphActionsProvider>
  );
}
