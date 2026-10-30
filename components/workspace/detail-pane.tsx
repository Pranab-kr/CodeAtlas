"use client";

import { useMemo, useState, type ReactNode } from "react";

import {
  neighboursOf,
  rankRepository,
  SUMMARY_LIMIT,
  unidentifiedCount,
  type Neighbour,
  type Ranked,
} from "@/lib/graph/detail";
import type { FoldedModule, FoldResult } from "@/lib/graph/fold";
import {
  findInsights,
  INSIGHT_SENTENCES,
  type Cycle,
} from "@/lib/graph/insights";
import {
  adjacency,
  DEFAULT_DEPTH,
  reach,
  type Adjacency,
  type Direction,
} from "@/lib/graph/reach";
import type { Selection } from "@/lib/graph/selection";
import type {
  EdgeKind,
  ParsedEdge,
  ParsedFile,
} from "@/lib/parser/types";
import { cn } from "@/lib/utils";
import {
  countKinds,
  kindLabel,
  kindOfPath,
  kindTone,
  matchesType,
} from "@/lib/workspace/kinds";

import { AskPanel } from "./ask-panel";
import {
  ExplanationPanel,
  IDLE_EXPLANATION,
  type ExplanationState,
  type ExplanationTarget,
} from "./explanation";
import { FileTypeFilter } from "./file-type-filter";

export type DetailTab = "structure" | "explanation";

/** What the pane says about the repository that isn't in the file and edge lists. */
export interface RepositoryFacts {
  name: string;
  framework: string;
  skipped: number;
  unresolved: number;
  /** Routes whose method and full pattern are both written in the code. */
  routes: number;
}

interface DetailPaneProps {
  files: readonly ParsedFile[];
  edges: readonly ParsedEdge[];
  fold: FoldResult;
  repository: RepositoryFacts;
  selection: Selection;
  hover: Selection;
  /** File types the pane lists. Empty means every type. */
  types: ReadonlySet<string>;
  onToggleType(kind: string): void;
  onClearTypes(): void;
  /** Held by the caller, so it outlives every change of selection. */
  tab: DetailTab;
  onTab(tab: DetailTab): void;
  /** Which walk the pane is showing, if any. */
  walk: Direction | null;
  onWalk(walk: Direction | null): void;
  insightsOpen: boolean;
  onInsightsOpen(open: boolean): void;
  onReveal(path: string): void;
  onRevealFolder(id: string): void;
  onHover(selection: Selection): void;
  analysisId: string;
  aiConfigured: boolean;
  tracingConfigured: boolean;
  /** Ask is a mode of the whole pane, not a third tab. */
  askOpen: boolean;
  onAsk(open: boolean): void;
  agentConfigured: boolean;
  explanations: ReadonlyMap<string, ExplanationState>;
  onExplain(target: ExplanationTarget): void;
  onCheckStale(target: ExplanationTarget): void;
}

interface PathActions {
  isHovered(path: string): boolean;
  onReveal(path: string): void;
  onHover(selection: Selection): void;
}

export function DetailPane({
  files,
  edges,
  fold,
  repository,
  selection,
  hover,
  types,
  onToggleType,
  onClearTypes,
  tab,
  onTab,
  walk,
  onWalk,
  insightsOpen,
  onInsightsOpen,
  onReveal,
  onRevealFolder,
  onHover,
  analysisId,
  aiConfigured,
  tracingConfigured,
  askOpen,
  onAsk,
  agentConfigured,
  explanations,
  onExplain,
  onCheckStale,
}: DetailPaneProps) {
  const byPath = useMemo(
    () => new Map(files.map((file) => [file.path, file])),
    [files],
  );
  const filePaths = useMemo(
    () => new Set(files.map((file) => file.path)),
    [files],
  );
  // The model sees folded module ids (the directory), so a folder mentioned
  // in prose can be the same node the map draws.
  const folderIds = useMemo(
    () => new Map(fold.modules.map((entry) => [entry.directory, entry.id])),
    [fold],
  );
  // One adjacency for whichever file is selected; the walk itself is
  // arithmetic over edges the browser already has.
  const graph = useMemo(() => adjacency(edges), [edges]);

  // What Ask starts from. A folded folder is spoken about by its directory,
  // not by the id the canvas uses.
  const askContext = useMemo(() => {
    if (selection === null) {
      return null;
    }
    if (selection.kind === "file") {
      return { kind: "file" as const, path: selection.path };
    }
    const group = fold.modules.find(
      (entry) => entry.id === selection.id,
    );
    if (!group || group.directory === ".") {
      return null;
    }
    return { kind: "folder" as const, path: group.directory };
  }, [selection, fold]);

  // Whether a path is what the pointer is over, on the map or in here. A
  // hovered folder marks every file inside it.
  const isHovered = (path: string): boolean => {
    if (!hover) {
      return false;
    }
    if (hover.kind === "file") {
      return hover.path === path;
    }
    return fold.moduleByFile.get(path) === hover.id;
  };
  const paths: PathActions = { isHovered, onReveal, onHover };

  // The filter's counts describe what the pane is about — a file's blast
  // radius, a folder, the repository — so they say how much of the current
  // answer each type accounts for.
  const repoKinds = useMemo(
    () => countKinds(files.map((file) => file.path)),
    [files],
  );
  const typeContext = useMemo(() => {
    if (!selection) {
      return {
        label: "all files",
        paths: files.map((file) => file.path),
      };
    }

    if (selection.kind === "node") {
      const group = fold.modules.find(
        (entry) => entry.id === selection.id,
      );
      return {
        label: "this folder",
        paths: group?.files.map((file) => file.path) ?? [],
      };
    }

    if (walk) {
      return {
        label:
          walk === "dependents" ? "blast radius" : "dependency chain",
        paths: reach(graph, selection.path, walk).steps.flat(),
      };
    }

    const neighbours = neighboursOf(edges, selection.path);
    const nearby = new Set<string>();
    for (const row of neighbours.imports) {
      nearby.add(row.path);
    }
    for (const row of neighbours.importedBy) {
      nearby.add(row.path);
    }
    return {
      label: "imports & imported by",
      paths: [...nearby],
    };
  }, [selection, files, fold, graph, walk, edges]);
  const typeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const path of typeContext.paths) {
      const kind = kindOfPath(path);
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
    }
    return repoKinds.map(({ kind }) => ({
      kind,
      count: counts.get(kind) ?? 0,
    }));
  }, [repoKinds, typeContext]);

  let content: ReactNode;
  if (!selection) {
    content = (
      <RepositorySummary
        files={files}
        edges={edges}
        repository={repository}
        types={types}
        insightsOpen={insightsOpen}
        onInsightsOpen={onInsightsOpen}
        paths={paths}
      />
    );
  } else if (selection.kind === "file") {
    const file = byPath.get(selection.path);
    const target: ExplanationTarget | null = file
      ? {
          kind: "file",
          key: `file:${file.path}`,
          path: file.path,
        }
      : null;
    content =
      file && target ? (
        <Selected
          caption="file"
          title={<PathTitle path={file.path} paths={paths} />}
          explainTarget={target}
          explanation={explanations.get(target.key) ?? IDLE_EXPLANATION}
          analysisId={analysisId}
          aiConfigured={aiConfigured}
          tracingConfigured={tracingConfigured}
          filePaths={filePaths}
          folderIds={folderIds}
          onExplain={onExplain}
          onCheckStale={onCheckStale}
          onReveal={onReveal}
          onRevealFolder={onRevealFolder}
          onHover={onHover}
          tab={tab}
          onTab={onTab}
        >
          <FileStructure
            file={file}
            edges={edges}
            graph={graph}
            types={types}
            walk={walk}
            onWalk={onWalk}
            paths={paths}
          />
        </Selected>
      ) : null;
  } else {
    const group = fold.modules.find(
      (entry) => entry.id === selection.id,
    );
    const target: ExplanationTarget | null = group
      ? {
          kind: "folder",
          key: `folder:${group.id}`,
          id: group.id,
        }
      : null;
    content =
      group && target ? (
        <Selected
          caption="folder"
          title={
            <span className="font-mono text-[12px] break-all">
              {folderLabel(group.directory)}
            </span>
          }
          explainTarget={target}
          explanation={explanations.get(target.key) ?? IDLE_EXPLANATION}
          analysisId={analysisId}
          aiConfigured={aiConfigured}
          tracingConfigured={tracingConfigured}
          filePaths={filePaths}
          folderIds={folderIds}
          onExplain={onExplain}
          onCheckStale={onCheckStale}
          onReveal={onReveal}
          onRevealFolder={onRevealFolder}
          onHover={onHover}
          tab={tab}
          onTab={onTab}
        >
          <FolderStructure group={group} types={types} />
        </Selected>
      ) : null;
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border bg-card px-3">
        <span className="text-[10px] tracking-wide text-muted-foreground uppercase">
          {askOpen ? "Ask" : "Details"}
        </span>
        <button
          type="button"
          onClick={() => onAsk(!askOpen)}
          className={cn(
            "ml-auto rounded-[3px] border px-2 py-0.5 text-[10.5px]",
            askOpen
              ? "border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              : "border-selection bg-selection/15 text-foreground hover:bg-selection/20",
          )}
        >
          {askOpen ? "Details" : "Ask"}
        </button>
      </div>
      <div
        className={cn(
          "min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto",
          askOpen && "hidden",
        )}
      >
        <FileTypeFilter
          counts={typeCounts}
          context={typeContext.label}
          active={types}
          onToggle={onToggleType}
          onClear={onClearTypes}
        />
        {content}
      </div>
      <div
        className={cn(
          "min-h-0 w-full min-w-0 flex-1",
          askOpen ? "flex" : "hidden",
        )}
      >
        <AskPanel
          analysisId={analysisId}
          agentConfigured={agentConfigured}
          context={askContext}
          files={files}
          folderIds={folderIds}
          onReveal={onReveal}
          onRevealFolder={onRevealFolder}
          onHover={onHover}
        />
      </div>
    </div>
  );
}

// ── Nothing selected ─────────────────────────────────────────────────────────

function RepositorySummary({
  files,
  edges,
  repository,
  types,
  insightsOpen,
  onInsightsOpen,
  paths,
}: {
  files: readonly ParsedFile[];
  edges: readonly ParsedEdge[];
  repository: RepositoryFacts;
  types: ReadonlySet<string>;
  insightsOpen: boolean;
  onInsightsOpen(open: boolean): void;
  paths: PathActions;
}) {
  // Rankings are over the types being shown; the repository-wide counts above
  // still describe the whole repository.
  const ranked = useMemo(
    () =>
      rankRepository(
        files.filter((file) => matchesType(file.path, types)),
      ),
    [files, types],
  );
  // Distinct file-to-file pairs, the unit every file's own counts use, so this
  // is the sum of what the pane says for each file.
  const imports = useMemo(
    () => files.reduce((sum, file) => sum + file.fanOut, 0),
    [files],
  );
  const unidentified = useMemo(
    () => unidentifiedCount(files),
    [files],
  );

  return (
    <div className="pb-3">
      <header className="border-b border-border px-3 py-2">
        <h2 className="font-mono text-[13px] font-semibold break-all">
          {repository.name}
        </h2>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Framework{" "}
          <span className="text-foreground">
            {repository.framework === "none"
              ? "none detected"
              : repository.framework}
          </span>
        </p>
      </header>

      <dl className="grid grid-cols-3 border-b border-border">
        <Count
          label="Files"
          value={files.length}
          note={
            repository.skipped > 0
              ? `${repository.skipped} skipped`
              : null
          }
        />
        <Count
          label="Imports"
          value={imports}
          note={
            repository.unresolved > 0
              ? `${repository.unresolved} unresolved`
              : null
          }
          title="Distinct file-to-file imports resolved inside this repository"
        />
        <Count
          label="Routes"
          value={repository.routes}
          note={null}
          title="Routes whose method and full pattern are both written in the code"
        />
      </dl>

      <RankedList
        title="Most depended on"
        hint="by files importing it"
        ranked={ranked.mostDependedOn}
        figure={(file) => (
          <span className="text-incoming">←{file.fanIn}</span>
        )}
        paths={paths}
      />
      <RankedList
        title="Imported by nothing"
        hint="where reading starts"
        ranked={ranked.unimported}
        figure={(file) => (
          <span className="text-outgoing">{file.fanOut}→</span>
        )}
        paths={paths}
      />

      <section className="mt-3 px-3">
        <h3 className="flex items-baseline justify-between text-[11px] text-muted-foreground">
          <span>Unidentified by convention</span>
          <span className="text-foreground tabular-nums">
            {unidentified}
          </span>
        </h3>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {unidentified === files.length
            ? `No framework convention identified any of these ${files.length} files. Their imports are what places them on the map.`
            : `${files.length - unidentified} of ${files.length} files matched a framework convention; the rest are placed by their imports.`}
        </p>
      </section>

      {/* Last and closed: this pane explains the repository first, and the
          insights are there for whoever goes looking. */}
      <section className="mt-3 border-t border-border">
        <button
          type="button"
          aria-expanded={insightsOpen}
          onClick={() => onInsightsOpen(!insightsOpen)}
          className="flex w-full items-baseline gap-1.5 px-3 py-2 text-left text-[11px] hover:bg-muted/50"
        >
          <span className="w-2 text-muted-foreground">
            {insightsOpen ? "▾" : "▸"}
          </span>
          <span className="text-foreground">Insights</span>
          <span className="text-muted-foreground">
            facts from the import graph
          </span>
        </button>
        {insightsOpen && (
          <InsightList
            files={files}
            edges={edges}
            types={types}
            paths={paths}
          />
        )}
      </section>
    </div>
  );
}

// ── Insights ─────────────────────────────────────────────────────────────────

function InsightList({
  files,
  edges,
  types,
  paths,
}: {
  files: readonly ParsedFile[];
  edges: readonly ParsedEdge[];
  types: ReadonlySet<string>;
  paths: PathActions;
}) {
  const insights = useMemo(
    () => findInsights(files, edges),
    [files, edges],
  );
  const unimported = useMemo(
    () => insights.unimported.filter((file) => matchesType(file.path, types)),
    [insights, types],
  );
  const heavilyImported = useMemo(
    () => ({
      files: insights.heavilyImported.files.filter((file) =>
        matchesType(file.path, types),
      ),
      threshold: insights.heavilyImported.threshold,
    }),
    [insights, types],
  );
  // A loop is evidence as a whole: if any file in it is filtered out, showing
  // the rest would be a loop that isn't there.
  const cycles = useMemo(
    () =>
      insights.cycles.filter((cycle) =>
        cycle.files.every((path) => matchesType(path, types)),
      ),
    [insights, types],
  );
  const long = useMemo(
    () => insights.long.filter((file) => matchesType(file.path, types)),
    [insights, types],
  );

  // Files nothing imports leads: for someone new here that one explains the
  // most. Loops and long files read closer to a verdict, so they come last.
  return (
    <div className="pb-1">
      <InsightSection
        title="Nothing imports or reaches"
        sentence={INSIGHT_SENTENCES.unimported}
        count={unimported.length}
        items={unimported}
        render={(file) => (
          <PathRow
            key={file.path}
            path={file.path}
            paths={paths}
            trailing={
              <span className="text-outgoing">{file.fanOut}→</span>
            }
          />
        )}
      />
      <InsightSection
        title="Imported unusually often"
        hint={
          Number.isFinite(heavilyImported.threshold)
            ? `by more than ${heavilyImported.threshold}`
            : undefined
        }
        sentence={INSIGHT_SENTENCES.heavilyImported}
        count={heavilyImported.files.length}
        items={heavilyImported.files}
        render={(file) => (
          <PathRow
            key={file.path}
            path={file.path}
            paths={paths}
            trailing={
              <span className="text-incoming">←{file.fanIn}</span>
            }
          />
        )}
      />
      <InsightSection
        title="Import loops"
        sentence={INSIGHT_SENTENCES.cycles}
        count={cycles.length}
        items={cycles}
        render={(cycle) => (
          <CycleRows key={cycle.files[0]} cycle={cycle} paths={paths} />
        )}
      />
      <InsightSection
        title="Long files"
        sentence={INSIGHT_SENTENCES.long}
        count={long.length}
        items={long}
        render={(file) => (
          <PathRow
            key={file.path}
            path={file.path}
            paths={paths}
            trailing={
              <span className="text-muted-foreground">
                {file.lines.toLocaleString("en")}
              </span>
            }
          />
        )}
      />
    </div>
  );
}

function InsightSection<T>({
  title,
  hint,
  sentence,
  count,
  items,
  render,
}: {
  title: string;
  hint?: string;
  sentence: string;
  count: number;
  items: readonly T[];
  render: (item: T) => ReactNode;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, SUMMARY_LIMIT);

  return (
    <section className="mt-2">
      <h3 className="flex items-baseline gap-1.5 px-3 text-[11px] text-muted-foreground">
        <span className="text-foreground">{title}</span>
        {hint && <span>{hint}</span>}
        <span className="ml-auto tabular-nums">{count}</span>
      </h3>
      <p className="px-3 pb-0.5 text-[11px] text-muted-foreground">
        {sentence}
      </p>
      {items.length === 0 ? (
        <p className="px-3 text-[11px] text-muted-foreground">None.</p>
      ) : (
        <ul>{shown.map(render)}</ul>
      )}
      {items.length > SUMMARY_LIMIT && (
        <button
          type="button"
          onClick={() => setAll(!all)}
          className="px-3 pt-0.5 text-[10px] text-muted-foreground tabular-nums hover:text-foreground hover:underline"
        >
          {all ? "Show fewer" : `Show all ${items.length}`}
        </button>
      )}
    </section>
  );
}

// One loop, in import order, so it can be walked by opening each file in turn.
function CycleRows({
  cycle,
  paths,
}: {
  cycle: Cycle;
  paths: PathActions;
}) {
  return (
    <li className="mt-1">
      <p className="px-3 text-[10px] text-muted-foreground tabular-nums">
        {cycle.files.length}{" "}
        {cycle.files.length === 1 ? "file" : "files"}
        {cycle.members > cycle.files.length &&
          `, one loop among ${cycle.members} files that all reach each other`}
      </p>
      <ul>
        {cycle.files.map((path, index) => (
          <PathRow
            key={path}
            path={path}
            paths={paths}
            trailing={
              <span className="text-outgoing">
                {index === cycle.files.length - 1 ? "↩ first" : "↓"}
              </span>
            }
          />
        ))}
      </ul>
    </li>
  );
}

function Count({
  label,
  value,
  note,
  title,
}: {
  label: string;
  value: number | null;
  note: string | null;
  title?: string;
}) {
  return (
    <div
      className="border-r border-border px-3 py-2 last:border-r-0"
      title={title}
    >
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="text-[15px] leading-5 tabular-nums">
        {value ?? <span className="text-muted-foreground">—</span>}
      </dd>
      {note && (
        <dd className="text-[10px] text-muted-foreground tabular-nums">
          {note}
        </dd>
      )}
    </div>
  );
}

function RankedList({
  title,
  hint,
  ranked,
  figure,
  paths,
}: {
  title: string;
  hint: string;
  ranked: Ranked;
  figure: (file: ParsedFile) => ReactNode;
  paths: PathActions;
}) {
  return (
    <section className="mt-3">
      <h3 className="flex items-baseline gap-1.5 px-3 pb-0.5 text-[11px] text-muted-foreground">
        <span className="text-foreground">{title}</span>
        <span>{hint}</span>
        <span className="ml-auto tabular-nums">{ranked.total}</span>
      </h3>
      {ranked.files.length === 0 ? (
        <p className="px-3 text-[11px] text-muted-foreground">None.</p>
      ) : (
        <ul>
          {ranked.files.map((file) => (
            <PathRow
              key={file.path}
              path={file.path}
              paths={paths}
              trailing={figure(file)}
            />
          ))}
        </ul>
      )}
      {ranked.total > ranked.files.length && (
        <p className="px-3 pt-0.5 text-[10px] text-muted-foreground tabular-nums">
          {ranked.total - ranked.files.length} more not listed
        </p>
      )}
    </section>
  );
}

// ── Something selected ───────────────────────────────────────────────────────

function Selected({
  caption,
  title,
  explainTarget,
  explanation,
  analysisId,
  aiConfigured,
  tracingConfigured,
  filePaths,
  folderIds,
  onExplain,
  onCheckStale,
  onReveal,
  onRevealFolder,
  onHover,
  tab,
  onTab,
  children,
}: {
  caption: string;
  title: ReactNode;
  explainTarget: ExplanationTarget;
  explanation: ExplanationState;
  analysisId: string;
  aiConfigured: boolean;
  tracingConfigured: boolean;
  filePaths: ReadonlySet<string>;
  folderIds: ReadonlyMap<string, string>;
  onExplain(target: ExplanationTarget): void;
  onCheckStale(target: ExplanationTarget): void;
  onReveal(path: string): void;
  onRevealFolder(id: string): void;
  onHover(selection: Selection): void;
  tab: DetailTab;
  onTab(tab: DetailTab): void;
  children: ReactNode;
}) {
  return (
    <div className="pb-3">
      <header className="border-b border-border px-3 pt-2">
        <p className="text-[10px] text-muted-foreground">{caption}</p>
        <h2 className="leading-4">{title}</h2>
        <div role="tablist" className="mt-2 flex gap-3 text-[11px]">
          <TabButton
            tab="structure"
            label="Structure"
            current={tab}
            onTab={onTab}
          />
          <TabButton
            tab="explanation"
            label="Explanation"
            current={tab}
            onTab={onTab}
          />
        </div>
      </header>
      {tab === "structure" ? (
        children
      ) : (
        <ExplanationPanel
          analysisId={analysisId}
          target={explainTarget}
          state={explanation}
          aiConfigured={aiConfigured}
          tracingConfigured={tracingConfigured}
          filePaths={filePaths}
          folderIds={folderIds}
          onExplain={onExplain}
          onCheckStale={onCheckStale}
          onReveal={onReveal}
          onRevealFolder={onRevealFolder}
          onHover={onHover}
        />
      )}
    </div>
  );
}

function TabButton({
  tab,
  label,
  current,
  onTab,
}: {
  tab: DetailTab;
  label: string;
  current: DetailTab;
  onTab(tab: DetailTab): void;
}) {
  const active = tab === current;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={() => onTab(tab)}
      className={cn(
        "-mb-px border-b pb-1.5",
        active
          ? "border-selection text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

// Clickable like every other path in the pane: it brings the file back into
// view on the map if its folder has been scrolled or closed since.
function PathTitle({
  path,
  paths,
}: {
  path: string;
  paths: PathActions;
}) {
  const slash = path.lastIndexOf("/");
  return (
    <button
      type="button"
      onClick={() => paths.onReveal(path)}
      onMouseEnter={() => paths.onHover({ kind: "file", path })}
      onMouseLeave={() => paths.onHover(null)}
      className="text-left font-mono text-[12px] break-all hover:underline"
    >
      {slash >= 0 && (
        <span className="text-muted-foreground">
          {path.slice(0, slash + 1)}
        </span>
      )}
      <span className="font-semibold">{path.slice(slash + 1)}</span>
    </button>
  );
}

function FileStructure({
  file,
  edges,
  graph,
  types,
  walk,
  onWalk,
  paths,
}: {
  file: ParsedFile;
  edges: readonly ParsedEdge[];
  graph: Adjacency;
  types: ReadonlySet<string>;
  walk: Direction | null;
  onWalk(walk: Direction | null): void;
  paths: PathActions;
}) {
  // The counts are the lengths of the filtered lists, so they can't disagree.
  const { imports, importedBy } = useMemo(() => {
    const neighbours = neighboursOf(edges, file.path);
    return {
      imports: neighbours.imports.filter((row) =>
        matchesType(row.path, types),
      ),
      importedBy: neighbours.importedBy.filter((row) =>
        matchesType(row.path, types),
      ),
    };
  }, [edges, file.path, types]);
  const kind = kindOfPath(file.path);

  return (
    <>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 border-b border-border px-3 py-2 text-[11px]">
        <Fact label="Kind">
          <span className="flex items-center gap-1.5 font-mono">
            <KindSwatch kind={kind} />
            {kindLabel(kind)}
          </span>
        </Fact>
        <Fact label="Folder">
          <span className="font-mono break-all">{file.folder}</span>
        </Fact>
        <Fact label="Length">
          {file.lines} {file.lines === 1 ? "line" : "lines"}
        </Fact>
        <Fact label="Exports">
          {file.exports === null ? (
            <span className="text-muted-foreground">
              not recorded; run the analysis again
            </span>
          ) : file.exports.length === 0 ? (
            <span className="text-muted-foreground">
              nothing named in this file
            </span>
          ) : (
            <span className="font-mono break-all">
              {file.exports.join(", ")}
            </span>
          )}
        </Fact>
        <Fact label="Depends on">
          <span className="text-outgoing">{imports.length}</span>{" "}
          {imports.length === 1 ? "file" : "files"}
        </Fact>
        <Fact label="Depended on by">
          <span className="text-incoming">{importedBy.length}</span>{" "}
          {importedBy.length === 1 ? "file" : "files"}
        </Fact>
      </dl>

      <div className="flex gap-1.5 border-b border-border px-3 py-2">
        <WalkButton
          direction="dependents"
          label="Blast radius"
          walk={walk}
          onWalk={onWalk}
        />
        <WalkButton
          direction="dependencies"
          label="Dependency chain"
          walk={walk}
          onWalk={onWalk}
        />
      </div>
      {walk && (
        <ReachList
          file={file.path}
          graph={graph}
          direction={walk}
          types={types}
          paths={paths}
        />
      )}

      <NeighbourList
        title="Imports"
        count={<span className="text-outgoing">{imports.length}→</span>}
        rows={imports}
        paths={paths}
      />
      <NeighbourList
        title="Imported by"
        count={
          <span className="text-incoming">←{importedBy.length}</span>
        }
        rows={importedBy}
        paths={paths}
      />
    </>
  );
}

function WalkButton({
  direction,
  label,
  walk,
  onWalk,
}: {
  direction: Direction;
  label: string;
  walk: Direction | null;
  onWalk(walk: Direction | null): void;
}) {
  const on = walk === direction;
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onWalk(on ? null : direction)}
      className={cn(
        "rounded-[3px] border px-2 py-0.5 text-[11px]",
        on
          ? "border-selection bg-selection/15 text-foreground"
          : "border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

// Worked out on the spot from the edges already here: no request, no spinner.
function ReachList({
  file,
  graph,
  direction,
  types,
  paths,
}: {
  file: string;
  graph: Adjacency;
  direction: Direction;
  types: ReadonlySet<string>;
  paths: PathActions;
}) {
  const { steps, beyond } = useMemo(
    () =>
      reach(graph, file, direction, DEFAULT_DEPTH, (path) =>
        matchesType(path, types),
      ),
    [graph, file, direction, types],
  );
  const total = steps.reduce((sum, step) => sum + step.length, 0);
  const dependents = direction === "dependents";

  return (
    <section className="mt-3">
      <h3 className="flex items-baseline gap-1.5 px-3 pb-0.5 text-[11px] text-muted-foreground">
        <span className="text-foreground">
          {dependents ? "Blast radius" : "Dependency chain"}
        </span>
        <span>
          {dependents
            ? "what imports this, directly or through others"
            : "what this imports, directly or through others"}
        </span>
        <span
          className={cn(
            "ml-auto tabular-nums",
            dependents ? "text-incoming" : "text-outgoing",
          )}
        >
          {total}
        </span>
      </h3>
      {steps.map((step, index) => (
        <div key={index}>
          <h4 className="px-3 pt-1 text-[10px] text-muted-foreground tabular-nums">
            {index + 1} {index === 0 ? "step" : "steps"} away ·{" "}
            {step.length}
          </h4>
          {step.length === 0 ? (
            <p className="px-3 text-[11px] text-muted-foreground">
              None.
            </p>
          ) : (
            <ul>
              {step.map((path) => (
                <PathRow key={path} path={path} paths={paths} />
              ))}
            </ul>
          )}
        </div>
      ))}
      <p className="px-3 pt-1 text-[10px] text-muted-foreground tabular-nums">
        {beyond > 0
          ? `${beyond} more further than ${DEFAULT_DEPTH} steps, not listed.`
          : `Nothing further than ${DEFAULT_DEPTH} steps.`}
      </p>
      {types.size > 0 && (
        <p className="px-3 pt-0.5 text-[10px] text-muted-foreground">
          Only the selected types are listed; the walk still passes through
          the rest.
        </p>
      )}
    </section>
  );
}

function Fact({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 tabular-nums">{children}</dd>
    </>
  );
}

function NeighbourList({
  title,
  count,
  rows,
  paths,
}: {
  title: string;
  count: ReactNode;
  rows: readonly Neighbour[];
  paths: PathActions;
}) {
  return (
    <section className="mt-3">
      <h3 className="flex items-baseline justify-between px-3 pb-0.5 text-[11px]">
        <span>{title}</span>
        <span className="tabular-nums">{count}</span>
      </h3>
      {rows.length === 0 ? (
        <p className="px-3 text-[11px] text-muted-foreground">None.</p>
      ) : (
        <ul>
          {rows.map((row) => (
            <PathRow
              key={row.path}
              path={row.path}
              paths={paths}
              trailing={<EdgeMarks kinds={row.kinds} />}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

// Only what differs from a plain import is marked, so most rows carry nothing.
const EDGE_MARK_LABELS: Partial<Record<EdgeKind, string>> = {
  reexport: "re-export",
  dynamic: "dynamic",
  require: "require",
};

function EdgeMarks({ kinds }: { kinds: readonly EdgeKind[] }) {
  const marks = kinds
    .filter((kind) => kind !== "import")
    .map((kind) => EDGE_MARK_LABELS[kind] ?? kind);
  if (marks.length === 0) {
    return null;
  }
  return (
    <span className="text-muted-foreground">{marks.join(" · ")}</span>
  );
}

function FolderStructure({
  group,
  types,
}: {
  group: FoldedModule;
  types: ReadonlySet<string>;
}) {
  const kinds = useMemo(
    () =>
      countKinds(
        group.files
          .filter((file) => matchesType(file.path, types))
          .map((file) => file.path),
      ),
    [group, types],
  );

  return (
    <>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 border-b border-border px-3 py-2 text-[11px]">
        <Fact label="Files">{group.files.length}</Fact>
        <Fact label="Imported from outside by">
          <span className="text-incoming">{group.fanIn}</span>{" "}
          {group.fanIn === 1 ? "file" : "files"}
        </Fact>
        <Fact label="Imports from outside">
          <span className="text-outgoing">{group.fanOut}</span>{" "}
          {group.fanOut === 1 ? "file" : "files"}
        </Fact>
      </dl>

      <section className="mt-3">
        <h3 className="px-3 pb-0.5 text-[11px]">
          Kinds of file inside
        </h3>
        <ul>
          {kinds.length === 0 && (
            <li className="px-3 text-[11px] text-muted-foreground">
              None.
            </li>
          )}
          {kinds.map(({ kind, count }) => (
            <li
              key={kind}
              className="flex h-[22px] items-center gap-2 px-3 text-[11px]"
            >
              <KindSwatch kind={kind} />
              <span className="flex-1 font-mono">{kindLabel(kind)}</span>
              <span className="text-muted-foreground tabular-nums">
                {count}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

// ── Shared ───────────────────────────────────────────────────────────────────

function KindSwatch({ kind }: { kind: string }) {
  const tone = kindTone(kind);
  return (
    <span
      aria-hidden
      className="size-[8px] shrink-0 rounded-[2px]"
      style={{
        backgroundColor:
          tone === null
            ? "var(--muted-foreground)"
            : `var(--kind-${tone + 1})`,
      }}
    />
  );
}

// Every path in the pane is one of these: clicking moves the map's selection
// to it, hovering marks it on the map, and it's marked here when the map
// reports the pointer over it.
function PathRow({
  path,
  paths,
  trailing,
}: {
  path: string;
  paths: PathActions;
  trailing?: ReactNode;
}) {
  const slash = path.lastIndexOf("/");
  const hovered = paths.isHovered(path);
  return (
    <li>
      <button
        type="button"
        title={path}
        onClick={() => paths.onReveal(path)}
        onMouseEnter={() => paths.onHover({ kind: "file", path })}
        onMouseLeave={() => paths.onHover(null)}
        className={cn(
          "flex h-[22px] w-full min-w-0 items-center gap-2 px-3 text-left text-[11px]",
          hovered
            ? "bg-selection/15 shadow-[inset_2px_0_0_var(--selection)]"
            : "hover:bg-muted/50",
        )}
      >
        <span className="flex min-w-0 flex-1 overflow-hidden font-mono">
          {slash >= 0 && (
            <span className="truncate text-muted-foreground">
              {path.slice(0, slash + 1)}
            </span>
          )}
          <span className="truncate">{path.slice(slash + 1)}</span>
        </span>
        {trailing ? (
          <span className="shrink-0 text-[10px] tabular-nums">
            {trailing}
          </span>
        ) : null}
      </button>
    </li>
  );
}

function folderLabel(directory: string): string {
  return directory === "." ? "(root)" : `${directory}/`;
}
