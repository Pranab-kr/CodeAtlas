"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { RerunButton } from "@/components/analyses/rerun-button";
import type { StaleInfo } from "@/lib/ai/types";
import type { Selection } from "@/lib/graph/selection";
import { cn } from "@/lib/utils";

export type ExplanationTarget =
  | {
      kind: "file";
      key: string;
      path: string;
    }
  | {
      kind: "folder";
      key: string;
      id: string;
    };

export interface ExplanationState {
  status: "idle" | "loading" | "ready" | "error";
  body: string | null;
  cached: boolean;
  error: string | null;
  warning: string | null;
  stale: StaleInfo | null | undefined;
  staleStatus: "idle" | "loading" | "ready";
}

export const IDLE_EXPLANATION: ExplanationState = {
  status: "idle",
  body: null,
  cached: false,
  error: null,
  warning: null,
  stale: undefined,
  staleStatus: "idle",
};

interface ExplanationPanelProps {
  analysisId: string;
  target: ExplanationTarget;
  state: ExplanationState;
  aiConfigured: boolean;
  tracingConfigured: boolean;
  filePaths: ReadonlySet<string>;
  folderIds: ReadonlyMap<string, string>;
  onExplain(target: ExplanationTarget): void;
  onCheckStale(target: ExplanationTarget): void;
  onReveal(path: string): void;
  onRevealFolder(id: string): void;
  onHover(selection: Selection): void;
}

export function ExplanationPanel({
  analysisId,
  target,
  state,
  aiConfigured,
  tracingConfigured,
  filePaths,
  folderIds,
  onExplain,
  onCheckStale,
  onReveal,
  onRevealFolder,
  onHover,
}: ExplanationPanelProps) {
  // One staleness check per target, even under a double-invoked effect. The
  // result lives in the parent, so returning to this file doesn't ask again.
  const checked = useRef<string | null>(null);

  useEffect(() => {
    if (!aiConfigured || state.staleStatus !== "idle") {
      return;
    }
    if (checked.current === target.key) {
      return;
    }
    checked.current = target.key;
    onCheckStale(target);
  }, [aiConfigured, state.staleStatus, target, onCheckStale]);

  if (!aiConfigured) {
    return (
      <div className="px-3 py-3 text-[11px]">
        <p>Explanations are not configured.</p>
        <p className="mt-1.5 text-muted-foreground">
          Set <span className="font-mono">AI_BASE_URL</span>,{" "}
          <span className="font-mono">AI_API_KEY</span> and{" "}
          <span className="font-mono">AI_MODEL</span> in{" "}
          <span className="font-mono">.env.local</span>. The map still works
          without them; files convention could not identify stay unclassified.
        </p>
      </div>
    );
  }

  const busy = state.status === "loading";

  return (
    <div className="px-3 py-3 text-[11px]">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onExplain(target)}
          disabled={busy}
          className={cn(
            "rounded-sm border px-2 py-0.5",
            "border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            "disabled:cursor-default disabled:opacity-60",
          )}
        >
          {busy
            ? state.body
              ? "Reloading…"
              : "Writing…"
            : state.body
              ? "Reload"
              : "Explain"}
        </button>
        {state.cached ? (
          <span className="text-[10px] text-muted-foreground">cached</span>
        ) : null}
        {!tracingConfigured ? (
          <span className="text-[10px] text-muted-foreground">
            tracing off
          </span>
        ) : null}
      </div>

      {busy && !state.body ? (
        <p className="mt-2 text-muted-foreground">
          Reading the {target.kind} and its neighbours…
        </p>
      ) : null}

      {state.error ? (
        <p role="alert" className="mt-2 text-destructive">
          {state.error}
        </p>
      ) : null}

      {state.warning ? (
        <p className="mt-2 text-muted-foreground">{state.warning}</p>
      ) : null}

      {state.body ? (
        <ExplanationBody
          body={state.body}
          filePaths={filePaths}
          folderIds={folderIds}
          onReveal={onReveal}
          onRevealFolder={onRevealFolder}
          onHover={onHover}
        />
      ) : null}

      {state.staleStatus === "loading" ? (
        <p className="mt-3 text-[10px] text-muted-foreground">
          Checking for changes…
        </p>
      ) : null}

      <StaleNotice
        stale={state.stale}
        analysisId={analysisId}
        target={target}
      />

      {!tracingConfigured ? (
        <p className="mt-3 text-[10px] text-muted-foreground">
          Tracing is off. Set{" "}
          <span className="font-mono">LANGSMITH_TRACING=true</span> and{" "}
          <span className="font-mono">LANGSMITH_API_KEY</span> to record
          runs.
        </p>
      ) : null}
    </div>
  );
}

function StaleNotice({
  stale,
  analysisId,
  target,
}: {
  stale: StaleInfo | null | undefined;
  analysisId: string;
  target: ExplanationTarget;
}) {
  if (stale === undefined || stale === null) {
    return null;
  }

  if (stale.kind === "unknown") {
    return (
      <p className="mt-3 border border-dashed border-border px-2 py-1.5 text-[10px] text-muted-foreground">
        Couldn&apos;t check for changes: {stale.message}
      </p>
    );
  }

  const message =
    stale.kind === "file-changed"
      ? "This file changed or was removed after the analysed commit. The explanation may be out of date."
      : target.kind === "file"
        ? "The repository moved past the analysed commit. This file is unchanged, but the map is older than the repository."
        : "The repository moved past the analysed commit. The folder may have changed since the map was built.";

  return (
    <div className="mt-3 border border-dashed border-border bg-muted/30 px-2 py-1.5">
      <p>{message}</p>
      <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
        {stale.analysedSha.slice(0, 7)} → {stale.headSha.slice(0, 7)}
      </p>
      <div className="mt-1.5">
        <RerunButton analysisId={analysisId} />
      </div>
    </div>
  );
}

// ── Rendering ────────────────────────────────────────────────────────────────

interface Linker {
  filePaths: ReadonlySet<string>;
  folderIds: ReadonlyMap<string, string>;
  onReveal(path: string): void;
  onRevealFolder(id: string): void;
  onHover(selection: Selection): void;
}

type Block =
  | { kind: "paragraph"; text: string }
  | { kind: "bullets"; items: string[] };

export function ExplanationBody({
  body,
  filePaths,
  folderIds,
  onReveal,
  onRevealFolder,
  onHover,
}: {
  body: string;
  filePaths: ReadonlySet<string>;
  folderIds: ReadonlyMap<string, string>;
  onReveal(path: string): void;
  onRevealFolder(id: string): void;
  onHover(selection: Selection): void;
}) {
  const linker: Linker = {
    filePaths,
    folderIds,
    onReveal,
    onRevealFolder,
    onHover,
  };
  const blocks = parseBlocks(body);

  return (
    <div className="mt-2 min-w-0 space-y-2 break-words [overflow-wrap:anywhere]">
      {blocks.map((block, index) =>
        block.kind === "paragraph" ? (
          <p key={index} className="min-w-0 leading-[1.45] break-words">
            {inline(block.text, linker, `p-${index}`)}
          </p>
        ) : (
          <ul key={index} className="min-w-0 list-disc space-y-1 pl-4">
            {block.items.map((item, itemIndex) => (
              <li
                key={itemIndex}
                className="min-w-0 leading-[1.45] break-words"
              >
                {inline(item, linker, `b-${index}-${itemIndex}`)}
              </li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}

/**
 * The prompt permits inline code, bullets and bold. Anything else markdown
 * can produce is removed rather than printed — a heading becomes a paragraph,
 * an unmatched marker disappears. The pane is too narrow to ship a renderer
 * that lost.
 */
function parseBlocks(body: string): Block[] {
  const lines = body.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let bullets: string[] = [];
  let fenced = false;

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: "paragraph", text: paragraph.join(" ") });
      paragraph = [];
    }
  };
  const flushBullets = () => {
    if (bullets.length > 0) {
      blocks.push({ kind: "bullets", items: bullets });
      bullets = [];
    }
  };
  const flush = () => {
    flushParagraph();
    flushBullets();
  };

  for (const raw of lines) {
    const line = raw.trim();

    if (line.startsWith("```")) {
      flush();
      fenced = !fenced;
      continue;
    }
    if (line === "") {
      flush();
      continue;
    }
    if (fenced) {
      flush();
      paragraph.push(line);
      continue;
    }
    if (/^(?:[-*+]|\d+\.)\s+/.test(line)) {
      flushParagraph();
      bullets.push(line.replace(/^(?:[-*+]|\d+\.)\s+/, ""));
      continue;
    }
    if (/^#{1,6}\s+/.test(line)) {
      flush();
      paragraph.push(line.replace(/^#{1,6}\s+/, ""));
      continue;
    }

    flushBullets();
    paragraph.push(line);
  }

  flush();
  return blocks;
}

function inline(
  text: string,
  linker: Linker,
  prefix: string,
): ReactNode[] {
  const nodes: ReactNode[] = [];
  let buffer = "";
  let index = 0;
  let key = 0;

  const flush = () => {
    if (buffer !== "") {
      nodes.push(...textNodes(buffer, linker, `${prefix}-t-${key++}`));
      buffer = "";
    }
  };

  while (index < text.length) {
    if (text.startsWith("**", index)) {
      const end = text.indexOf("**", index + 2);
      if (end !== -1) {
        flush();
        nodes.push(
          <strong key={`${prefix}-b-${key++}`} className="font-semibold">
            {inline(text.slice(index + 2, end), linker, `${prefix}-b-${key}`)}
          </strong>,
        );
        index = end + 2;
        continue;
      }
      index += 2;
      continue;
    }

    if (text[index] === "`") {
      const end = text.indexOf("`", index + 1);
      if (end !== -1) {
        flush();
        nodes.push(
          codeNode(
            text.slice(index + 1, end),
            linker,
            `${prefix}-c-${key++}`,
          ),
        );
        index = end + 1;
        continue;
      }
      index += 1;
      continue;
    }

    if (text[index] === "*" || text[index] === "#") {
      index += 1;
      continue;
    }

    buffer += text[index];
    index += 1;
  }

  flush();
  return nodes;
}

function textNodes(
  text: string,
  linker: Linker,
  prefix: string,
): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Longer extensions first, or `foo.tsx` would match `foo.ts` and leave the
  // `x` behind. The boundary checks keep a word or a longer path from being
  // linked as a substring.
  const pattern =
    /(?:\.{0,2}\/)?(?:[\w@.-]+\/)*[\w@.-]+\.(?:tsx|jsx|mts|cts|mjs|cjs|ts|js)|(?:\.{0,2}\/)?(?:[\w@.-]+\/)+/g;
  let cursor = 0;
  let key = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const raw = match[0];
    const before = match.index === 0 ? "" : text[match.index - 1];

    if (
      (before !== "" && /[\w@.-]/.test(before)) ||
      continuesPath(text, match.index + raw.length)
    ) {
      continue;
    }

    const file = filePathOf(raw, linker);
    const folder = file === null ? folderIdOf(raw, linker) : null;

    if (file === null && folder === null) {
      continue;
    }

    if (match.index > cursor) {
      nodes.push(text.slice(cursor, match.index));
    }

    if (file !== null) {
      nodes.push(
        <PathButton
          key={`${prefix}-f-${key++}`}
          label={raw}
          path={file}
          linker={linker}
        />,
      );
    } else if (folder !== null) {
      nodes.push(
        <PathButton
          key={`${prefix}-d-${key++}`}
          label={raw}
          folder={folder}
          linker={linker}
        />,
      );
    }

    cursor = match.index + raw.length;
  }

  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }

  return nodes;
}

function codeNode(
  value: string,
  linker: Linker,
  key: string,
): ReactNode {
  const token = trimToken(value);
  const file = filePathOf(token, linker);
  if (file !== null) {
    return (
      <PathButton key={key} label={token} path={file} linker={linker} />
    );
  }

  const folder = folderIdOf(token, linker);
  if (folder !== null) {
    return (
      <PathButton key={key} label={token} folder={folder} linker={linker} />
    );
  }

  return (
    <code
      key={key}
      className="rounded-xs bg-muted px-1 py-px font-mono text-[10.5px] break-words [overflow-wrap:anywhere]"
    >
      {stripMarkers(value)}
    </code>
  );
}

function PathButton({
  label,
  path,
  folder,
  linker,
}: {
  label: string;
  path?: string;
  folder?: string;
  linker: Linker;
}) {
  const hover: Selection =
    path !== undefined
      ? { kind: "file", path }
      : folder !== undefined
        ? { kind: "node", id: folder }
        : null;

  return (
    <button
      type="button"
      title={path ?? folder}
      onClick={() => {
        if (path !== undefined) {
          linker.onReveal(path);
        } else if (folder !== undefined) {
          linker.onRevealFolder(folder);
        }
      }}
      onMouseEnter={() => linker.onHover(hover)}
      onMouseLeave={() => linker.onHover(null)}
      className="-mx-0.5 max-w-full rounded-xs px-0.5 text-left font-mono break-words text-selection underline decoration-border underline-offset-2 [overflow-wrap:anywhere] hover:bg-selection/10 hover:decoration-selection"
    >
      {stripMarkers(label)}
    </button>
  );
}

/** Whether the token continues into a longer filename or path. */
function continuesPath(text: string, index: number): boolean {
  const next = text[index] ?? "";
  if (next === "") {
    return false;
  }
  if (/[\w@-]/.test(next) || next === "/") {
    return true;
  }
  if (next === ".") {
    const after = text[index + 1] ?? "";
    return after !== "" && /[\w@-]/.test(after);
  }
  return false;
}

function filePathOf(token: string, linker: Linker): string | null {
  const clean = withoutLine(trimToken(token));
  const candidates = [clean, clean.replace(/^\.\//, "")];

  for (const candidate of candidates) {
    if (linker.filePaths.has(candidate)) {
      return candidate;
    }
  }
  return null;
}

function folderIdOf(token: string, linker: Linker): string | null {
  const clean = trimToken(token).replace(/\/+$/, "");
  if (clean === "" || clean === ".") {
    return null;
  }
  return linker.folderIds.get(clean.replace(/^\.\//, "")) ?? null;
}

function trimToken(value: string): string {
  return value
    .trim()
    .replace(/^[("'`[{]+/, "")
    .replace(/[)"'`,;:.!?\]}]+$/, "");
}

function withoutLine(value: string): string {
  return value.replace(/:\d+(?::\d+)?$/, "");
}

function stripMarkers(value: string): string {
  return value.replace(/[*`#]/g, "");
}
