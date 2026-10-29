"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { Selection } from "@/lib/graph/selection";
import type { Endpoint } from "@/lib/graph/view";

export interface MapHover {
  /** What the pointer is over, here or in the pane. */
  selection: Selection;
  /** The canvas endpoint that stands for it, if it's on the canvas at all. */
  endpoint: Endpoint | null;
}

const MapHoverContext = createContext<MapHover>({
  selection: null,
  endpoint: null,
});

/**
 * Hover travels beside the node data rather than inside it. Rebuilding node
 * data on every mouse move makes React Flow diff and re-measure the whole
 * canvas; a context value only re-renders the nodes that read it.
 */
export function MapHoverProvider({
  hover,
  children,
}: {
  hover: MapHover;
  children: ReactNode;
}) {
  return (
    <MapHoverContext.Provider value={hover}>
      {children}
    </MapHoverContext.Provider>
  );
}

export function useMapHover(): MapHover {
  return useContext(MapHoverContext);
}
