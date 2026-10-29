"use client";

import { useCallback, useMemo, useState } from "react";

import { foldModules } from "@/lib/graph/fold";
import type { Selection } from "@/lib/graph/selection";
import {
  clampOffset,
  MAX_ROWS,
  rankModulePaths,
} from "@/lib/graph/view";
import type { ParsedEdge, ParsedFile } from "@/lib/parser/types";
import { categoriesFromFiles } from "@/lib/workspace/categories";

import { CategoryRail } from "./category-rail";
import { DependencyMap } from "./dependency-map";
import {
  DetailPane,
  type DetailTab,
  type RepositoryFacts,
} from "./detail-pane";
import { WorkspaceShell } from "./workspace-shell";

/**
 * Owns what the map and the pane share: which folders are open, how far each
 * is scrolled, what's selected, what's hovered, and which tab the pane has
 * open. Everything either side shows comes from parse output already in the
 * browser, so nothing here makes a request.
 */
export function AnalysisView({
  repository,
  files,
  edges,
}: {
  repository: RepositoryFacts;
  files: readonly ParsedFile[];
  edges: readonly ParsedEdge[];
}) {
  const fold = useMemo(
    () =>
      foldModules(files, edges, { rootLabel: repository.name }),
    [files, edges, repository.name],
  );
  const categories = useMemo(
    () => categoriesFromFiles(files),
    [files],
  );

  const [open, setOpen] = useState<ReadonlyMap<string, number>>(
    () => new Map(),
  );
  const [refit, setRefit] = useState(0);
  const [selection, setSelection] = useState<Selection>(null);
  const [hover, setHover] = useState<Selection>(null);
  // Held here rather than in the pane so it outlives every change of
  // selection. Someone comparing explanations across files keeps their tab.
  const [tab, setTab] = useState<DetailTab>("structure");

  // A folded node's only click opens it, so opening also selects the folder
  // the pane should describe.
  const openModule = useCallback((id: string) => {
    setOpen((previous) => new Map(previous).set(id, 0));
    setSelection({ kind: "node", id });
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
      // A selection inside a folded-away panel has nothing left to point at.
      setSelection((previous) => {
        if (previous?.kind === "node" && previous.id === id) {
          return null;
        }
        if (
          previous?.kind === "file" &&
          fold.moduleByFile.get(previous.path) === id
        ) {
          return null;
        }
        return previous;
      });
    },
    [fold],
  );

  const selectFile = useCallback((path: string) => {
    setSelection({ kind: "file", path });
  }, []);

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

  // A path clicked in the pane becomes the selection on the map, and the map
  // shows it: its folder opens if it's folded, and scrolls if the row is
  // outside the window. A panel already showing the row stays put.
  const reveal = useCallback(
    (path: string) => {
      const id = fold.moduleByFile.get(path);
      if (id === undefined) {
        return;
      }
      const group = fold.modules.find((entry) => entry.id === id);
      if (!group) {
        return;
      }

      const ranked = rankModulePaths(group.files);
      const index = ranked.indexOf(path);
      if (index === -1) {
        return;
      }

      const current = open.get(id);
      const first =
        current === undefined ? null : clampOffset(current, ranked.length);
      if (
        first === null ||
        index < first ||
        index >= first + MAX_ROWS
      ) {
        setOpen(
          new Map(open).set(
            id,
            Math.max(0, index - Math.floor(MAX_ROWS / 2)),
          ),
        );
        if (current === undefined) {
          setRefit((count) => count + 1);
        }
      }

      setSelection({ kind: "file", path });
      // The row under the pointer is about to be replaced, and a removed
      // element never reports the pointer leaving it.
      setHover(null);
    },
    [fold, open],
  );

  const deselect = useCallback(() => setSelection(null), []);

  return (
    <WorkspaceShell
      rail={<CategoryRail categories={categories} />}
      map={
        <DependencyMap
          edges={edges}
          fold={fold}
          open={open}
          selection={selection}
          hover={hover}
          refit={refit}
          onOpen={openModule}
          onClose={closeModule}
          onSelectFile={selectFile}
          onScroll={scroll}
          onHover={setHover}
          onDeselect={deselect}
        />
      }
      detail={
        <DetailPane
          files={files}
          edges={edges}
          fold={fold}
          repository={repository}
          selection={selection}
          hover={hover}
          tab={tab}
          onTab={setTab}
          onReveal={reveal}
          onHover={setHover}
        />
      }
    />
  );
}
