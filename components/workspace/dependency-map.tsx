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
import { PANEL_MAX_ROWS, layoutModules } from "@/lib/graph/layout";
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

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2;
const FIT_PADDING = 0.08;

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

function samePaths(
  left: ReadonlySet<string>,
  right: ReadonlySet<string>,
): boolean {
  if (left.size !== right.size) {
    return false;
  }
  for (const path of left) {
    if (!right.has(path)) {
      return false;
    }
  }
  return true;
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
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  const [focus, setFocus] = useState<GraphFocus>(null);
  const [ready, setReady] = useState(false);
  const [visibleFiles, setVisibleFiles] = useState<
    ReadonlyMap<string, ReadonlySet<string>>
  >(() => new Map());
  const fold = useMemo(
    () => foldModules(files, edges, { rootLabel }),
    [files, edges, rootLabel],
  );
  const layout = useMemo(
    () => layoutModules(fold, expanded),
    [fold, expanded],
  );
  const tones = useMemo(() => categoryToneMap(files), [files]);
  const graph = useMemo(
    () =>
      buildFlowGraph({
        fold,
        layout,
        expanded,
        focus,
        tones,
        visibleFiles,
      }),
    [fold, layout, expanded, focus, tones, visibleFiles],
  );

  const { getViewport, setViewport } = useReactFlow();
  const store = useStoreApi();
  const viewportReady = useStore(
    (state) => state.width > 0 && state.height > 0,
  );
  const hasFitted = useRef(false);

  const handleInit = useCallback(() => {
    setReady(true);
    const { width, height } = store.getState();
    if (!width || !height) {
      return;
    }

    const viewport = getViewportForBounds(
      layout.bounds,
      width,
      height,
      MIN_ZOOM,
      1,
      FIT_PADDING,
    );
    void setViewport(viewport);
    hasFitted.current = true;
  }, [layout, setViewport, store]);

  useEffect(() => {
    if (!viewportReady) {
      return;
    }

    const { width, height } = store.getState();
    if (!width || !height) {
      return;
    }

    const currentZoom = getViewport().zoom;
    const maxZoom = hasFitted.current
      ? Math.min(currentZoom, MAX_ZOOM)
      : 1;
    const viewport = getViewportForBounds(
      layout.bounds,
      width,
      height,
      MIN_ZOOM,
      maxZoom,
      FIT_PADDING,
    );

    void setViewport(viewport);
    hasFitted.current = true;
  }, [layout, viewportReady, getViewport, setViewport, store]);

  const openModule = useCallback(
    (id: string) => {
      setExpanded((previous) => {
        const next = new Set(previous);
        next.add(id);
        return next;
      });
      const entry = fold.modules.find((module) => module.id === id);
      if (entry) {
        setVisibleFiles((previous) => {
          const next = new Map(previous);
          next.set(
            id,
            new Set(
              entry.files
                .slice(0, PANEL_MAX_ROWS)
                .map((file) => file.path),
            ),
          );
          return next;
        });
      }
      setFocus({ kind: "node", id });
    },
    [fold],
  );

  const closeModule = useCallback((id: string) => {
    setExpanded((previous) => {
      const next = new Set(previous);
      next.delete(id);
      return next;
    });
    setVisibleFiles((previous) => {
      if (!previous.has(id)) {
        return previous;
      }
      const next = new Map(previous);
      next.delete(id);
      return next;
    });
    setFocus({ kind: "node", id });
  }, []);

  const reportVisibleFiles = useCallback(
    (nodeId: string, paths: ReadonlySet<string>) => {
      setVisibleFiles((previous) => {
        const current = previous.get(nodeId);
        if (current && samePaths(current, paths)) {
          return previous;
        }
        const next = new Map(previous);
        next.set(nodeId, paths);
        return next;
      });
    },
    [],
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

  const selectFile = useCallback(
    (path: string) => {
      const nodeId = fold.moduleByFile.get(path);
      if (!nodeId) {
        return;
      }
      setFocus({ kind: "file", nodeId, path });
    },
    [fold],
  );

  const clearSelection = useCallback(() => {
    setFocus(null);
  }, []);

  const actions = useMemo<GraphActions>(
    () => ({
      openModule,
      closeModule,
      selectFile,
      clearSelection,
      reportVisibleFiles,
    }),
    [
      openModule,
      closeModule,
      selectFile,
      clearSelection,
      reportVisibleFiles,
    ],
  );

  return (
    <GraphActionsProvider actions={actions}>
      <ReactFlow<FlowModuleNode, Edge>
        nodes={graph.nodes}
        edges={graph.edges}
        nodeTypes={nodeTypes}
        onNodeClick={handleNodeClick}
        onInit={handleInit}
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
        colorMode="system"
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
