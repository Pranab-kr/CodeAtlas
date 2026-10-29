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

import { foldModules } from "@/lib/graph/fold";
import { boundsOf, layoutMap } from "@/lib/graph/layout";
import { buildView } from "@/lib/graph/view";
import type { ParsedEdge, ParsedFile } from "@/lib/parser/types";
import { cn } from "@/lib/utils";
import { categoryToneMap } from "@/lib/workspace/categories";

import {
  GraphActionsProvider,
  type GraphActions,
} from "./graph-actions";
import {
  buildFlowGraph,
  type FlowModuleNode,
  type GraphFocus,
} from "./graph-model";
import { ModuleNode } from "./module-node";
import { ModulePanel } from "./module-panel";

const nodeTypes = { module: ModuleNode, panel: ModulePanel };

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 2;
/** Initial fit may enlarge a small graph a little, never to poster size. */
const INITIAL_MAX_ZOOM = 1.25;
const FIT_PADDING = 0.06;

export function DependencyMap({
  files,
  edges,
  rootLabel,
}: {
  files: readonly ParsedFile[];
  edges: readonly ParsedEdge[];
  rootLabel: string;
}) {
  return (
    <ReactFlowProvider>
      <GraphCanvas files={files} edges={edges} rootLabel={rootLabel} />
    </ReactFlowProvider>
  );
}

function GraphCanvas({
  files,
  edges,
  rootLabel,
}: {
  files: readonly ParsedFile[];
  edges: readonly ParsedEdge[];
  rootLabel: string;
}) {
  const [open, setOpen] = useState<ReadonlyMap<string, number>>(
    () => new Map(),
  );
  const [focus, setFocus] = useState<GraphFocus>(null);
  const [refit, setRefit] = useState(0);
  const [ready, setReady] = useState(false);

  const fold = useMemo(
    () => foldModules(files, edges, { rootLabel }),
    [files, edges, rootLabel],
  );
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
  const tones = useMemo(() => categoryToneMap(files), [files]);
  const graph = useMemo(
    () => buildFlowGraph({ view, boxes, focus, tones }),
    [view, boxes, focus, tones],
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

  const openModule = useCallback((id: string) => {
    setOpen((previous) => new Map(previous).set(id, 0));
    setFocus({ kind: "node", id });
    setRefit((count) => count + 1);
  }, []);

  const closeModule = useCallback(
    (id: string) => {
      setOpen((previous) => {
        if (!previous.has(id)) {
          return previous;
        }
        const next = new Map(previous);
        next.delete(id);
        return next;
      });
      setFocus((previous) => {
        if (previous?.kind === "node" && previous.id === id) {
          return previous;
        }
        if (previous?.kind === "file") {
          const at = view.endpointOf.get(previous.path);
          if (at?.object === id) {
            return null;
          }
        }
        return previous;
      });
    },
    [view],
  );

  const scroll = useCallback((id: string, offset: number) => {
    setOpen((previous) => {
      if (!previous.has(id)) {
        return previous;
      }
      const next = new Map(previous);
      next.set(id, Math.max(0, offset));
      return next;
    });
  }, []);

  const selectFile = useCallback((path: string) => {
    setFocus({ kind: "file", path });
  }, []);

  const clearSelection = useCallback(() => {
    setFocus(null);
  }, []);

  const actions = useMemo<GraphActions>(
    () => ({
      openModule,
      closeModule,
      selectFile,
      scroll,
      clearSelection,
    }),
    [
      openModule,
      closeModule,
      selectFile,
      scroll,
      clearSelection,
    ],
  );

  // React Flow only enables pointer events on a node when one of its own
  // handlers is present. The custom buttons handle the actual actions.
  const handleNodeClick: NodeMouseHandler<FlowModuleNode> = useCallback(
    (_event, node) => {
      if (node.type === "module") {
        openModule(node.id);
      }
    },
    [openModule],
  );

  return (
    <GraphActionsProvider actions={actions}>
      <ReactFlow<FlowModuleNode, Edge>
        nodes={graph.nodes}
        edges={graph.edges}
        nodeTypes={nodeTypes}
        onNodeClick={handleNodeClick}
        onInit={fitInitial}
        onPaneClick={clearSelection}
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
    </GraphActionsProvider>
  );
}
