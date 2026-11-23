"use client";

import {
  ArrowRight,
  ArrowUp,
  CheckIcon,
  InfoIcon,
  Loader2,
  RotateCcw,
  SearchIcon,
  SettingsIcon,
  XIcon,
} from "lucide-react";
import {
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CodeBlock, CodeBlockContent } from "@/components/ui/code-block";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceDescription,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@/components/ui/trace";
import { parseSse } from "@/lib/agent/sse";
import type { AskEvent } from "@/lib/agent/stream";
import type { Selection } from "@/lib/graph/selection";
import type { ParsedFile } from "@/lib/parser/types";
import { cn } from "@/lib/utils";

import { ExplanationBody } from "./explanation";

interface AskContext {
  kind: "file" | "folder";
  path: string;
}

interface ToolCall {
  id: string;
  name: string;
  args: unknown;
  status: "running" | "success" | "error";
  result: string | null;
}

interface Turn {
  id: string;
  question: string;
  context: AskContext | null;
  answer: string;
  tools: ToolCall[];
  status: "streaming" | "done" | "error";
  error: string | null;
}

interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
}

interface AskPanelProps {
  analysisId: string;
  aiConfigured: boolean;
  context: AskContext | null;
  files: readonly ParsedFile[];
  folderIds: ReadonlyMap<string, string>;
  onReveal(path: string): void;
  onRevealFolder(id: string): void;
  onHover(selection: Selection): void;
}

const MAX_HISTORY_MESSAGES = 20;
const MAX_HISTORY_MESSAGE_CHARS = 4_000;
const MAX_HISTORY_TOTAL_CHARS = 40_000;

const EXAMPLES = [
  "Where is authentication handled?",
  "What breaks if I change the most depended-on file?",
  "List the API routes.",
  "Is this code any good?",
];

/**
 * A mode of the pane, not a tab in it. The conversation lives here while the
 * pane is hidden, so toggling back to the map and returning keeps the thread
 * and the scroll position.
 */
export function AskPanel({
  analysisId,
  aiConfigured,
  context,
  files,
  folderIds,
  onReveal,
  onRevealFolder,
  onHover,
}: AskPanelProps) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const turnId = useRef(0);
  const sending = useRef(false);

  const filePaths = useMemo(
    () => new Set(files.map((file) => file.path)),
    [files],
  );

  const update = useCallback(
    (id: string, change: (turn: Turn) => Turn) => {
      setTurns((previous) =>
        previous.map((turn) => (turn.id === id ? change(turn) : turn)),
      );
    },
    [],
  );

  const send = useCallback(
    async (question: string) => {
      const text = question.trim();
      if (
        text === "" ||
        busy ||
        !aiConfigured ||
        sending.current
      ) {
        return;
      }

      sending.current = true;
      turnId.current += 1;
      const id = `turn-${turnId.current}`;
      const selection = context;
      const history = buildHistory(turns);

      setDraft("");
      setBusy(true);
      setTurns((previous) => [
        ...previous,
        {
          id,
          question: text,
          context: selection,
          answer: "",
          tools: [],
          status: "streaming",
          error: null,
        },
      ]);

      try {
        const response = await fetch("/api/agent/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            analysisId,
            message: text,
            history,
            selection,
          }),
        });

        if (!response.ok) {
          const message = await errorOf(response);
          update(id, (turn) => ({
            ...turn,
            status: "error",
            error: message,
            tools: finishTools(turn.tools, "error"),
          }));
          return;
        }
        if (response.body === null) {
          update(id, (turn) => ({
            ...turn,
            status: "error",
            error: "The agent returned no stream.",
            tools: finishTools(turn.tools, "error"),
          }));
          return;
        }

        for await (const frame of parseSse(response.body)) {
          if (frame.data === "") {
            continue;
          }

          let event: AskEvent;
          try {
            event = JSON.parse(frame.data) as AskEvent;
          } catch {
            continue;
          }

          if (event.type === "text") {
            update(id, (turn) => ({
              ...turn,
              answer: turn.answer + event.text,
            }));
          } else if (event.type === "tool_start") {
            update(id, (turn) => {
              if (turn.tools.some((tool) => tool.id === event.id)) {
                return turn;
              }
              return {
                ...turn,
                tools: [
                  ...turn.tools,
                  {
                    id: event.id,
                    name: event.name,
                    args: event.arguments,
                    status: "running",
                    result: null,
                  },
                ],
              };
            });
          } else if (event.type === "tool_end") {
            update(id, (turn) => {
              const exists = turn.tools.some(
                (tool) => tool.id === event.id,
              );
              const next = exists
                ? turn.tools.map((tool) =>
                    tool.id === event.id
                      ? {
                          ...tool,
                          name: event.name ?? tool.name,
                          status: event.status,
                          result: event.content,
                        }
                      : tool,
                  )
                : [
                    ...turn.tools,
                    {
                      id: event.id,
                      name: event.name ?? "tool",
                      args: null,
                      status: event.status,
                      result: event.content,
                    },
                  ];
              return { ...turn, tools: next };
            });
          } else if (event.type === "error") {
            update(id, (turn) => ({
              ...turn,
              status: "error",
              error: event.message,
              tools: finishTools(turn.tools, "error"),
            }));
          } else if (event.type === "done") {
            update(id, (turn) =>
              turn.status === "error"
                ? turn
                : {
                    ...turn,
                    status: "done",
                    tools: finishTools(turn.tools, "success"),
                  },
            );
          }
        }

        update(id, (turn) =>
          turn.status === "streaming"
            ? {
                ...turn,
                status: "done",
                tools: finishTools(turn.tools, "success"),
              }
            : turn,
        );
      } catch (error) {
        update(id, (turn) => ({
          ...turn,
          status: "error",
          error:
            error instanceof Error
              ? error.message
              : "The agent stopped before it answered.",
          tools: finishTools(turn.tools, "error"),
        }));
      } finally {
        sending.current = false;
        setBusy(false);
      }
    },
    [aiConfigured, analysisId, busy, context, turns, update],
  );

  const reset = useCallback(() => {
    if (busy) {
      return;
    }
    setTurns([]);
    setDraft("");
  }, [busy]);

  if (!aiConfigured) {
    const isDev = process.env.NODE_ENV !== "production";
    return (
      <div className="flex h-full min-h-0 w-full min-w-0 flex-col bg-surface">
        <Empty className="min-h-0 flex-1 px-5">
          <EmptyMedia variant="icon">
            <SettingsIcon className="size-4" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle className="text-[14px]">Ask is not configured</EmptyTitle>
            <EmptyDescription className="text-[12px] leading-relaxed">
              {isDev ? (
                <>
                  Set{" "}
                  <span className="font-mono text-foreground">AI_BASE_URL</span>
                  ,{" "}
                  <span className="font-mono text-foreground">AI_API_KEY</span>{" "}
                  and{" "}
                  <span className="font-mono text-foreground">AI_MODEL</span>{" "}
                  in{" "}
                  <span className="font-mono text-foreground">.env.local</span>,
                  then reload.
                </>
              ) : (
                "The repository assistant is not enabled on this deployment."
              )}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <p className="text-[11.5px] text-muted-foreground">
              The map, routes and blast radius work without it.
            </p>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col bg-surface">
      <div className="flex h-8 shrink-0 items-center justify-between gap-2 border-b border-hairline bg-chrome/50 px-3.5 text-[11px] text-muted-foreground">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0">Scope</span>
          <span className="truncate rounded-md bg-well px-1.5 py-0.5 font-mono text-[10.5px] text-foreground">
            {context === null
              ? "whole repository"
              : `${context.kind === "file" ? "file" : "folder"} · ${context.path}`}
          </span>
        </div>
        <button
          type="button"
          onClick={reset}
          disabled={busy || turns.length === 0}
          className="inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-well hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
        >
          <RotateCcw className="size-3" aria-hidden="true" />
          <span>New</span>
        </button>
      </div>

      <div className="min-h-0 min-w-0 flex-1">
        <MessageScrollerProvider autoScroll>
          <MessageScroller className="min-h-0">
            <MessageScrollerViewport className="atlas-scroll">
              <MessageScrollerContent className="gap-5 px-3.5 py-4">
                {turns.length === 0 ? (
                  <MessageScrollerItem className="flex min-h-full flex-1 flex-col justify-center">
                    <div className="mx-auto w-full max-w-sm py-4">
                      <div className="flex size-9 items-center justify-center rounded-xl bg-well text-foreground shadow-2xs">
                        <SearchIcon className="size-4" aria-hidden="true" />
                      </div>
                      <h2 className="mt-3.5 text-[15px] font-medium tracking-[-0.01em] text-foreground">
                        Ask the map
                      </h2>
                      <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
                        Every answer is looked up in the parsed files and edges;
                        nothing is recalled.
                      </p>
                      <div className="mt-4 grid gap-1.5">
                        {EXAMPLES.map((example) => (
                          <button
                            key={example}
                            type="button"
                            onClick={() => void send(example)}
                            className="group flex w-full items-center justify-between gap-2 rounded-xl bg-well/65 px-3 py-2 text-left text-[12px] text-foreground ring-1 ring-inset ring-hairline transition-all hover:bg-well hover:ring-hairline-strong"
                          >
                            <span className="leading-snug">{example}</span>
                            <ArrowRight
                              className="size-3.5 shrink-0 text-muted-foreground opacity-60 transition-transform group-hover:translate-x-0.5 group-hover:opacity-100"
                              aria-hidden="true"
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                  </MessageScrollerItem>
                ) : (
                  turns.map((turn) => (
                    <MessageScrollerItem
                      key={turn.id}
                      messageId={turn.id}
                      scrollAnchor
                    >
                      <TurnView
                        turn={turn}
                        filePaths={filePaths}
                        folderIds={folderIds}
                        onReveal={onReveal}
                        onRevealFolder={onRevealFolder}
                        onHover={onHover}
                      />
                    </MessageScrollerItem>
                  ))
                )}
              </MessageScrollerContent>
            </MessageScrollerViewport>
            <MessageScrollerButton />
          </MessageScroller>
        </MessageScrollerProvider>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void send(draft);
        }}
        className="min-w-0 shrink-0 border-t border-hairline bg-chrome/40 p-3"
      >
        <div className="rounded-xl bg-raised shadow-xs ring-1 ring-inset ring-hairline-strong transition-shadow focus-within:ring-selection/55">
          <textarea
            rows={2}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                void send(draft);
              }
            }}
            placeholder="Ask about files, routes, or blast radius…"
            aria-label="Ask about this repository"
            className="block max-h-40 min-h-[52px] w-full resize-none bg-transparent px-3 pt-2.5 pb-1.5 text-[12.5px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground"
          />
          <div className="flex items-center justify-between gap-2 px-2.5 pb-2 pt-1">
            <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="shrink-0">About</span>
              <span className="truncate rounded-md bg-well/80 px-1.5 py-0.5 font-mono text-[10.5px] text-foreground">
                {context === null ? "the repository" : context.path}
              </span>
            </div>
            <button
              type="submit"
              disabled={busy || draft.trim() === ""}
              aria-label={busy ? "Asking" : "Send question"}
              className={cn(
                "inline-flex size-7 shrink-0 items-center justify-center rounded-lg transition-all",
                busy || draft.trim() === ""
                  ? "bg-well text-muted-foreground opacity-55"
                  : "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
              )}
            >
              {busy ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <ArrowUp className="size-3.5" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function TurnView({
  turn,
  filePaths,
  folderIds,
  onReveal,
  onRevealFolder,
  onHover,
}: {
  turn: Turn;
  filePaths: ReadonlySet<string>;
  folderIds: ReadonlyMap<string, string>;
  onReveal(path: string): void;
  onRevealFolder(id: string): void;
  onHover(selection: Selection): void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-col items-end gap-1">
        <div className="max-w-[88%] rounded-2xl rounded-br-md bg-foreground/[0.075] px-3.5 py-2.5 text-[12.5px] leading-[1.5] whitespace-pre-wrap text-foreground dark:bg-raised">
          {turn.question}
        </div>
        {turn.context !== null ? (
          <span className="max-w-full truncate font-mono text-[10px] text-muted-foreground">
            {turn.context.kind}: {turn.context.path}
          </span>
        ) : null}
      </div>

      <div className="min-w-0 space-y-2">
        {turn.tools.length > 0 ? (
          <LookupTrace tools={turn.tools} />
        ) : turn.status === "streaming" && turn.answer === "" ? (
          <div className="inline-flex items-center gap-2 rounded-lg bg-well/65 px-2.5 py-1.5 text-[11.5px] text-muted-foreground">
            <Loader2 className="size-3 animate-spin" aria-hidden="true" />
            <span>Looking through the graph…</span>
          </div>
        ) : null}

        {turn.answer !== "" ? (
          <div className="min-w-0 [&>div]:mt-0">
            <ExplanationBody
              body={turn.answer}
              filePaths={filePaths}
              folderIds={folderIds}
              onReveal={onReveal}
              onRevealFolder={onRevealFolder}
              onHover={onHover}
            />
          </div>
        ) : null}

        {turn.error !== null ? (
          <Alert variant="destructive" className="rounded-xl">
            <AlertTitle>Agent error</AlertTitle>
            <AlertDescription className="font-mono text-[11px] wrap-break-word">
              {turn.error}
            </AlertDescription>
          </Alert>
        ) : null}

        {turn.status === "done" &&
        turn.answer === "" &&
        turn.error === null ? (
          <Marker>
            <MarkerIcon>
              <InfoIcon />
            </MarkerIcon>
            <MarkerContent>
              {turn.tools.length === 0
                ? "The agent wrote no answer."
                : `The agent used ${
                    turn.tools.length
                  } ${turn.tools.length === 1 ? "lookup" : "lookups"} but wrote no answer.`}{" "}
              Ask again or rephrase.
            </MarkerContent>
          </Marker>
        ) : null}
      </div>
    </div>
  );
}

function LookupTrace({ tools }: { tools: ToolCall[] }) {
  const running = tools.some((tool) => tool.status === "running");
  const failed = tools.some((tool) => tool.status === "error");
  const count = tools.length;
  const word = count === 1 ? "lookup" : "lookups";
  const title = failed
    ? `Failed to run ${count} ${word}`
    : running
      ? `Running ${count} ${word}`
      : `Ran ${count} ${word}`;
  const latest = tools.at(-1);

  return (
    <div className="rounded-xl bg-well/55 px-2.5 py-1.5 ring-1 ring-inset ring-hairline">
      <Trace>
        <TraceCollapsible>
          <TraceCollapsibleTrigger>
            <TraceLine status={failed ? "error" : undefined}>
              <TraceIcon>
                <StatusIcon
                  status={failed ? "error" : running ? "running" : "success"}
                />
              </TraceIcon>
              <TraceTitle>{title}</TraceTitle>
              {latest ? (
                <TraceDescription className="font-mono text-[10.5px]">
                  {latest.name}
                </TraceDescription>
              ) : null}
            </TraceLine>
          </TraceCollapsibleTrigger>
          <TraceCollapsibleContent>
            <Trace className="mt-1">
              {tools.map((tool) => (
                <LookupRow key={tool.id} tool={tool} />
              ))}
            </Trace>
          </TraceCollapsibleContent>
        </TraceCollapsible>
      </Trace>
    </div>
  );
}

function LookupRow({ tool }: { tool: ToolCall }) {
  const detail = describeArguments(tool.args);
  const verb =
    tool.status === "running"
      ? "Running"
      : tool.status === "error"
        ? "Failed to run"
        : "Ran";
  const line = (
    <TraceLine
      status={tool.status === "error" ? "error" : undefined}
      title={detail || undefined}
    >
      <TraceIcon>
        <StatusIcon status={tool.status} />
      </TraceIcon>
      <TraceTitle>
        {verb} <span className="font-mono">{tool.name}</span>
        {detail !== "" ? (
          <span className="text-muted-foreground"> {detail}</span>
        ) : null}
      </TraceTitle>
    </TraceLine>
  );

  if (tool.result === null || tool.result === "") {
    return line;
  }

  return (
    <TraceCollapsible>
      <TraceCollapsibleTrigger>{line}</TraceCollapsibleTrigger>
      <TraceCollapsibleContent>
        <CodeBlock
          size="sm"
          variant={tool.status === "error" ? "destructive" : "default"}
        >
          <CodeBlockContent wrap className="max-h-64">
            {tool.result}
          </CodeBlockContent>
        </CodeBlock>
      </TraceCollapsibleContent>
    </TraceCollapsible>
  );
}

function StatusIcon({ status }: { status: ToolCall["status"] }) {
  if (status === "error") {
    return <XIcon className="text-destructive" />;
  }
  if (status === "running") {
    return <Loader2 className="animate-spin" />;
  }
  return <CheckIcon className="text-incoming" />;
}

function describeArguments(args: unknown): string {
  if (!isRecord(args)) {
    return "";
  }
  if (typeof args.path === "string") {
    const extra = [
      typeof args.direction === "string" ? args.direction : null,
      typeof args.depth === "number" ? `depth ${args.depth}` : null,
    ]
      .filter((value): value is string => value !== null)
      .join(" ");
    return extra === "" ? args.path : `${args.path} ${extra}`;
  }
  if (typeof args.query === "string") {
    return `"${args.query}"`;
  }
  if (typeof args.role === "string") {
    return args.role;
  }
  return "";
}

function finishTools(
  tools: ToolCall[],
  status: "success" | "error",
): ToolCall[] {
  if (!tools.some((tool) => tool.status === "running")) {
    return tools;
  }
  return tools.map((tool) =>
    tool.status === "running" ? { ...tool, status } : tool,
  );
}

async function errorOf(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (isRecord(body) && typeof body.error === "string") {
      return body.error;
    }
  } catch {
    // Fall through to the status.
  }
  return `The agent returned ${response.status}.`;
}

function buildHistory(turns: readonly Turn[]): HistoryMessage[] {
  const messages: HistoryMessage[] = [];
  for (const turn of turns) {
    if (turn.status !== "done") {
      continue;
    }
    const answer = turn.answer.trim();
    if (answer === "") {
      continue;
    }
    const question =
      turn.context === null
        ? turn.question
        : `${turn.question}\n\n[Selected on the map: ${turn.context.kind} ${turn.context.path}]`;
    messages.push(
      {
        role: "user",
        content: question.trim().slice(0, MAX_HISTORY_MESSAGE_CHARS),
      },
      {
        role: "assistant",
        content: answer.slice(0, MAX_HISTORY_MESSAGE_CHARS),
      },
    );
  }

  const trimmed = messages.slice(-MAX_HISTORY_MESSAGES);
  let total = trimmed.reduce((sum, entry) => sum + entry.content.length, 0);
  while (trimmed.length >= 2 && total > MAX_HISTORY_TOTAL_CHARS) {
    const removedUser = trimmed.shift();
    const removedAssistant = trimmed.shift();
    total -=
      (removedUser?.content.length ?? 0) +
      (removedAssistant?.content.length ?? 0);
  }
  return trimmed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
