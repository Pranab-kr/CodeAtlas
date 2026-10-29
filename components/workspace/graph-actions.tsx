"use client";

import { createContext, useContext, type ReactNode } from "react";

export interface GraphActions {
  openModule(id: string): void;
  closeModule(id: string): void;
  selectFile(path: string): void;
  /** Move a panel's window by this many rows; the view clamps it. */
  scroll(id: string, offset: number): void;
  clearSelection(): void;
}

const GraphActionsContext = createContext<GraphActions | null>(null);

export function GraphActionsProvider({
  actions,
  children,
}: {
  actions: GraphActions;
  children: ReactNode;
}) {
  return (
    <GraphActionsContext.Provider value={actions}>
      {children}
    </GraphActionsContext.Provider>
  );
}

export function useGraphActions(): GraphActions {
  const actions = useContext(GraphActionsContext);
  if (!actions) {
    throw new Error(
      "useGraphActions must be used inside GraphActionsProvider.",
    );
  }
  return actions;
}
