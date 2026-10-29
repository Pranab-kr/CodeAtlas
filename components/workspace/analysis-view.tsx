"use client";

import { useCallback, useMemo, useState } from "react";

import {
  explainAction,
  stalenessAction,
} from "@/app/(app)/analyses/[id]/explain-actions";
import type { ExplainTargetInput } from "@/lib/ai/types";
import { foldModules } from "@/lib/graph/fold";
import type { Direction } from "@/lib/graph/reach";
import type { Selection } from "@/lib/graph/selection";
import {
  clampOffset,
  MAX_ROWS,
  rankModulePaths,
} from "@/lib/graph/view";
import type {
  ParsedEdge,
  ParsedFile,
  ParsedRoute,
  RouteCoverage,
} from "@/lib/parser/types";
import type { Coverage } from "@/lib/analysis/coverage";
import { railCategories, UNCLASSIFIED } from "@/lib/roles";
import { cn } from "@/lib/utils";

import { CategoryRail } from "./category-rail";
import { CoverageBanner } from "./coverage-banner";
import { DependencyMap } from "./dependency-map";
import {
  DetailPane,
  type DetailTab,
  type RepositoryFacts,
} from "./detail-pane";
import {
  IDLE_EXPLANATION,
  type ExplanationState,
  type ExplanationTarget,
} from "./explanation";
import { RouteTable } from "./route-table";
import { WorkspaceShell } from "./workspace-shell";

/**
 * Owns what the map and the pane share: which folders are open, how far each
 * is scrolled, what's selected, what's hovered, which tab the pane has open,
 * and whether the centre column shows the map or the route table. Everything
 * either side shows comes from parse output already in the browser, except an
 * explanation, which is requested only when someone clicks Explain.
 */
export function AnalysisView({
  analysisId,
  aiConfigured,
  tracingConfigured,
  repository,
  coverage,
  files,
  edges,
  routes,
  routeCoverage,
}: {
  analysisId: string;
  aiConfigured: boolean;
  tracingConfigured: boolean;
  repository: RepositoryFacts;
  coverage: Coverage | null;
  files: readonly ParsedFile[];
  edges: readonly ParsedEdge[];
  routes: readonly ParsedRoute[];
  routeCoverage: RouteCoverage | null;
}) {
  const fold = useMemo(
    () =>
      foldModules(files, edges, { rootLabel: repository.name }),
    [files, edges, repository.name],
  );
  const categories = useMemo(
    () => railCategories(repository.framework, files.map((file) => file.role)),
    [repository.framework, files],
  );
  // The map focuses by the same role category the rail counts, not by folder.
  const categoryOfPath = useMemo(
    () =>
      new Map(
        files.map((file) => [file.path, file.role ?? UNCLASSIFIED] as const),
      ),
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
  // Likewise, so the same walk shows for each file while comparing them.
  const [walk, setWalk] = useState<Direction | null>(null);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [category, setCategory] = useState<string | null>(null);
  // The centre column shows the map or the route table; the rail and the pane
  // keep working on either.
  const [centre, setCentre] = useState<"map" | "routes">("map");
  // Empty means every type. Held here so it survives switching selection.
  const [types, setTypes] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  // Keyed by file path or folded folder id. Moving selection away and back
  // finds the body without a second request.
  const [explanations, setExplanations] = useState<
    ReadonlyMap<string, ExplanationState>
  >(() => new Map());

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

  const toggleCategory = useCallback((key: string) => {
    setCategory((previous) => (previous === key ? null : key));
  }, []);

  const toggleType = useCallback((kind: string) => {
    setTypes((previous) => {
      const next = new Set(previous);
      if (next.has(kind)) {
        next.delete(kind);
      } else {
        next.add(kind);
      }
      return next;
    });
  }, []);

  const clearTypes = useCallback(() => setTypes(new Set()), []);

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

  const updateExplanation = useCallback(
    (key: string, change: Partial<ExplanationState>) => {
      setExplanations((previous) => {
        const next = new Map(previous);
        next.set(key, {
          ...(previous.get(key) ?? IDLE_EXPLANATION),
          ...change,
        });
        return next;
      });
    },
    [],
  );

  const explain = useCallback(
    async (target: ExplanationTarget) => {
      updateExplanation(target.key, { status: "loading", error: null });

      try {
        const result = await explainAction({
          analysisId,
          target: targetInput(target),
        });

        if (result.ok) {
          updateExplanation(target.key, {
            status: "ready",
            body: result.body,
            cached: result.cached,
            error: null,
            warning: result.warning,
          });
        } else {
          updateExplanation(target.key, {
            status: "error",
            error: result.error,
          });
        }
      } catch (error) {
        updateExplanation(target.key, {
          status: "error",
          error: messageOf(error),
        });
      }
    },
    [analysisId, updateExplanation],
  );

  const checkStale = useCallback(
    async (target: ExplanationTarget) => {
      if (!aiConfigured) {
        return;
      }

      updateExplanation(target.key, { staleStatus: "loading" });

      try {
        const stale = await stalenessAction({
          analysisId,
          target: targetInput(target),
        });
        updateExplanation(target.key, { stale, staleStatus: "ready" });
      } catch (error) {
        updateExplanation(target.key, {
          stale: { kind: "unknown", message: messageOf(error) },
          staleStatus: "ready",
        });
      }
    },
    [analysisId, aiConfigured, updateExplanation],
  );

  return (
    <WorkspaceShell
      rail={
        <CategoryRail
          categories={categories}
          active={category}
          onToggle={toggleCategory}
        />
      }
      map={
        <div className="flex h-full min-h-0 flex-col">
          <div
            role="tablist"
            className="flex h-7 shrink-0 items-end gap-3 border-b border-border bg-card px-3 text-[11px]"
          >
            <CentreTab
              label="Map"
              on={centre === "map"}
              onClick={() => setCentre("map")}
            />
            <CentreTab
              label="Routes"
              count={routes.length}
              on={centre === "routes"}
              onClick={() => setCentre("routes")}
            />
          </div>
          <div className="relative min-h-0 flex-1">
            {/* The map stays mounted under the table, so switching back keeps
                its viewport and React Flow's measurements. */}
            <div
              className={cn(
                "absolute inset-0 flex flex-col",
                centre !== "map" && "invisible",
              )}
            >
              {coverage ? <CoverageBanner coverage={coverage} /> : null}
              <div className="min-h-0 flex-1">
                <DependencyMap
                  edges={edges}
                  fold={fold}
                  open={open}
                  selection={selection}
                  hover={hover}
                  category={category}
                  categoryOfPath={categoryOfPath}
                  refit={refit}
                  onOpen={openModule}
                  onClose={closeModule}
                  onSelectFile={selectFile}
                  onScroll={scroll}
                  onHover={setHover}
                  onDeselect={deselect}
                />
              </div>
            </div>
            {centre === "routes" ? (
              <RouteTable
                routes={routes}
                coverage={routeCoverage}
                selection={selection}
                hover={hover}
                onReveal={reveal}
                onHover={setHover}
              />
            ) : null}
          </div>
        </div>
      }
      detail={
        <DetailPane
          files={files}
          edges={edges}
          fold={fold}
          repository={repository}
          selection={selection}
          hover={hover}
          types={types}
          onToggleType={toggleType}
          onClearTypes={clearTypes}
          tab={tab}
          onTab={setTab}
          walk={walk}
          onWalk={setWalk}
          insightsOpen={insightsOpen}
          onInsightsOpen={setInsightsOpen}
          onReveal={reveal}
          onRevealFolder={openModule}
          onHover={setHover}
          analysisId={analysisId}
          aiConfigured={aiConfigured}
          tracingConfigured={tracingConfigured}
          explanations={explanations}
          onExplain={explain}
          onCheckStale={checkStale}
        />
      }
    />
  );
}

function CentreTab({
  label,
  count,
  on,
  onClick,
}: {
  label: string;
  count?: number;
  on: boolean;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={on}
      onClick={onClick}
      className={cn(
        "-mb-px border-b pb-1.5",
        on
          ? "border-selection text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
      {count !== undefined ? (
        <span className="ml-1 font-mono text-[10px] text-muted-foreground tabular-nums">
          {count}
        </span>
      ) : null}
    </button>
  );
}

function targetInput(target: ExplanationTarget): ExplainTargetInput {
  return target.kind === "file"
    ? { kind: "file", path: target.path }
    : { kind: "folder", id: target.id };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
