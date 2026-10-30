"use client";

import type { ReactNode } from "react";

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

/**
 * The three columns stay in this order. The rail and the detail pane are
 * resizable, because how much room an answer needs is a per-question thing.
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
  return (
    <ResizablePanelGroup
      orientation="horizontal"
      className="h-full min-h-0 overflow-hidden"
    >
      <ResizablePanel
        defaultSize="15%"
        minSize="10%"
        maxSize="30%"
        className="h-full min-h-0"
      >
        <nav
          aria-label="Categories"
          className="h-full min-h-0 min-w-0 overflow-y-auto bg-muted/20"
        >
          {rail}
        </nav>
      </ResizablePanel>

      <ResizableHandle withHandle />

      <ResizablePanel minSize="35%" className="h-full min-h-0">
        <section
          aria-label="Map"
          className="relative h-full min-h-0 min-w-0 overflow-hidden bg-background"
        >
          {map}
        </section>
      </ResizablePanel>

      <ResizableHandle withHandle />

      <ResizablePanel
        defaultSize="30%"
        minSize="24%"
        maxSize="55%"
        className="h-full min-h-0"
      >
        <aside
          aria-label="Details"
          className="h-full min-h-0 min-w-0 overflow-hidden bg-muted/10"
        >
          {detail}
        </aside>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
