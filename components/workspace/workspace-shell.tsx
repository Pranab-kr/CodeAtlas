"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePanelRef } from "react-resizable-panels";

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

export interface WorkspaceSidebarControls {
  railCollapsed: boolean;
  detailCollapsed: boolean;
  toggleRail(): void;
  toggleDetail(): void;
}

const WorkspaceSidebarContext = createContext<WorkspaceSidebarControls | null>(
  null,
);

export function useWorkspaceSidebars(): WorkspaceSidebarControls | null {
  return useContext(WorkspaceSidebarContext);
}

/**
 * The three columns stay in this order. Both sidebars are resizable and
 * collapsible (via toolbar controls or dragging past their minimum width),
 * giving the map full width whenever the user wants more room.
 */
export function WorkspaceShell({
  rail,
  map,
  detail,
}: {
  rail: ReactNode;
  map: ReactNode;
  detail: ReactNode;
}) {
  const railRef = usePanelRef();
  const detailRef = usePanelRef();
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [detailCollapsed, setDetailCollapsed] = useState(false);

  const toggleRail = useCallback(() => {
    const panel = railRef.current;
    if (!panel) {
      return;
    }
    if (panel.isCollapsed()) {
      panel.expand();
    } else {
      panel.collapse();
    }
  }, [railRef]);

  const toggleDetail = useCallback(() => {
    const panel = detailRef.current;
    if (!panel) {
      return;
    }
    if (panel.isCollapsed()) {
      panel.expand();
    } else {
      panel.collapse();
    }
  }, [detailRef]);

  const controls = useMemo<WorkspaceSidebarControls>(
    () => ({
      railCollapsed,
      detailCollapsed,
      toggleRail,
      toggleDetail,
    }),
    [railCollapsed, detailCollapsed, toggleRail, toggleDetail],
  );

  return (
    <WorkspaceSidebarContext.Provider value={controls}>
      <ResizablePanelGroup
        orientation="horizontal"
        className="h-full min-h-0 overflow-hidden bg-well"
      >
        <ResizablePanel
          panelRef={railRef}
          defaultSize="16%"
          minSize="11%"
          maxSize="30%"
          collapsible
          collapsedSize="0%"
          onResize={(size) => setRailCollapsed(size.asPercentage === 0)}
          className="h-full min-h-0"
        >
          <nav
            aria-label="Categories"
            aria-hidden={railCollapsed || undefined}
            className="atlas-scroll h-full min-h-0 min-w-0 overflow-y-auto bg-sidebar/75"
          >
            {rail}
          </nav>
        </ResizablePanel>

        <ResizableHandle withHandle={!railCollapsed} />

        <ResizablePanel minSize="35%" className="h-full min-h-0">
          <section
            aria-label="Map"
            className="relative h-full min-h-0 min-w-0 overflow-hidden bg-well"
          >
            {map}
          </section>
        </ResizablePanel>

        <ResizableHandle withHandle={!detailCollapsed} />

        <ResizablePanel
          panelRef={detailRef}
          defaultSize="30%"
          minSize="24%"
          maxSize="55%"
          collapsible
          collapsedSize="0%"
          onResize={(size) => setDetailCollapsed(size.asPercentage === 0)}
          className="h-full min-h-0"
        >
          <aside
            aria-label="Details"
            aria-hidden={detailCollapsed || undefined}
            className="h-full min-h-0 min-w-0 overflow-hidden bg-surface"
          >
            {detail}
          </aside>
        </ResizablePanel>
      </ResizablePanelGroup>
    </WorkspaceSidebarContext.Provider>
  );
}

