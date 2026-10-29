"use client";

import { useMemo, type ReactNode } from "react";

import {
  neighboursOf,
  rankRepository,
  unidentifiedCount,
  type Neighbour,
  type Ranked,
} from "@/lib/graph/detail";
import type { FoldedModule, FoldResult } from "@/lib/graph/fold";
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
} from "@/lib/workspace/kinds";

export type DetailTab = "structure" | "explanation";

/** What the pane says about the repository that isn't in the file and edge lists. */
export interface RepositoryFacts {
  name: string;
  framework: string;
  skipped: number;
  unresolved: number;
  /** Null until the parser extracts routes. */
  routes: number | null;
}

interface DetailPaneProps {
  files: readonly ParsedFile[];
  edges: readonly ParsedEdge[];
  fold: FoldResult;
  repository: RepositoryFacts;
  selection: Selection;
  hover: Selection;
  /** Held by the caller, so it outlives every change of selection. */
  tab: DetailTab;
  onTab(tab: DetailTab): void;
  onReveal(path: string): void;
  onHover(selection: Selection): void;
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
  tab,
  onTab,
  onReveal,
  onHover,
}: DetailPaneProps) {
  const byPath = useMemo(
    () => new Map(files.map((file) => [file.path, file])),
    [files],
  );

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

  if (!selection) {
    return (
      <RepositorySummary
        files={files}
        repository={repository}
        paths={paths}
      />
    );
  }

  if (selection.kind === "file") {
    const file = byPath.get(selection.path);
    if (!file) {
      return null;
    }
    return (
      <Selected
        caption="file"
        title={<PathTitle path={file.path} paths={paths} />}
        target="file"
        tab={tab}
        onTab={onTab}
      >
        <FileStructure
          file={file}
          edges={edges}
          paths={paths}
        />
      </Selected>
    );
  }

  const group = fold.modules.find(
    (entry) => entry.id === selection.id,
  );
  if (!group) {
    return null;
  }
  return (
    <Selected
      caption="folder"
      title={
        <span className="font-mono text-[12px] break-all">
          {folderLabel(group.directory)}
        </span>
      }
      target="folder"
      tab={tab}
      onTab={onTab}
    >
      <FolderStructure group={group} />
    </Selected>
  );
}

// ── Nothing selected ─────────────────────────────────────────────────────────

function RepositorySummary({
  files,
  repository,
  paths,
}: {
  files: readonly ParsedFile[];
  repository: RepositoryFacts;
  paths: PathActions;
}) {
  const ranked = useMemo(() => rankRepository(files), [files]);
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
          note={repository.routes === null ? "not parsed yet" : null}
          title="The parser does not extract routes yet"
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
    </div>
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
  target,
  tab,
  onTab,
  children,
}: {
  caption: string;
  title: ReactNode;
  target: "file" | "folder";
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
        <ExplanationEmptyState target={target} />
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

function ExplanationEmptyState({
  target,
}: {
  target: "file" | "folder";
}) {
  return (
    <div className="px-3 py-3 text-[11px]">
      <p>No explanation yet.</p>
      <p className="mt-1.5 text-muted-foreground">
        A paragraph written from this {target} and its real neighbours
        will appear here once explanations exist.
      </p>
    </div>
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
  paths,
}: {
  file: ParsedFile;
  edges: readonly ParsedEdge[];
  paths: PathActions;
}) {
  const { imports, importedBy } = useMemo(
    () => neighboursOf(edges, file.path),
    [edges, file.path],
  );
  const kind = kindOfPath(file.path);

  // Counts are the lengths of the lists below them, so they can't disagree.
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
        <Fact label="Depends on">
          <span className="text-outgoing">{imports.length}</span>{" "}
          {imports.length === 1 ? "file" : "files"}
        </Fact>
        <Fact label="Depended on by">
          <span className="text-incoming">{importedBy.length}</span>{" "}
          {importedBy.length === 1 ? "file" : "files"}
        </Fact>
      </dl>

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

function FolderStructure({ group }: { group: FoldedModule }) {
  const kinds = useMemo(
    () => countKinds(group.files.map((file) => file.path)),
    [group],
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
