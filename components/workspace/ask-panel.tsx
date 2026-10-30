"use client";

import {
  CheckIcon,
  CircleDotIcon,
  InfoIcon,
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
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { CodeBlock, CodeBlockContent } from "@/components/ui/code-block";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";
import {
  Message,
  MessageContent,
  MessageFooter,
  MessageHeader,
} from "@/components/ui/message";
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

interface AskPanelProps {
  analysisId: string;
  agentConfigured: boolean;
  context: AskContext | null;
  files: readonly ParsedFile[];
  folderIds: ReadonlyMap<string, string>;
  onReveal(path: string): void;
  onRevealFolder(id: string): void;
  onHover(selection: Selection): void;
}

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
  agentConfigured,
  context,
  files,
  folderIds,
  onReveal,
  onRevealFolder,
  onHover,
}: AskPanelProps) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
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
        !agentConfigured ||
        sending.current
      ) {
        return;
      }

      sending.current = true;
      turnId.current += 1;
      const id = `turn-${turnId.current}`;
      const selection = context;

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
            threadId,
            message: text,
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

          if (event.type === "thread") {
            setThreadId(event.threadId);
          } else if (event.type === "text") {
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
    [agentConfigured, analysisId, busy, context, threadId, update],
  );

  const reset = useCallback(() => {
    if (busy) {
      return;
    }
    setTurns([]);
    setThreadId(null);
    setDraft("");
  }, [busy]);

  if (!agentConfigured) {
    return (
      <div className="flex h-full min-h-0 w-full min-w-0 flex-col">
        <Empty className="min-h-0 flex-1">
          <EmptyMedia variant="icon">
            <SettingsIcon />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>Ask is not configured</EmptyTitle>
            <EmptyDescription>
              Set <span className="font-mono">AGENT_URL</span> and{" "}
              <span className="font-mono">AGENT_ASSISTANT_ID</span> in{" "}
              <span className="font-mono">.env.local</span>, start the
              agent service, and reload.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <p>The map, blast radius and explanations work without it.</p>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col">
      <div className="flex h-7 shrink-0 items-center gap-2 border-b border-border px-3 text-[10px] text-muted-foreground">
        <span>
          {context === null
            ? "whole repository"
            : `${context.kind === "file" ? "file" : "folder"} context`}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="ml-auto text-[10px]"
          onClick={reset}
          disabled={busy || turns.length === 0}
        >
          New
        </Button>
      </div>

      <div className="min-h-0 min-w-0 flex-1">
        <MessageScrollerProvider autoScroll>
          <MessageScroller className="min-h-0">
            <MessageScrollerViewport>
              <MessageScrollerContent className="gap-4 p-3">
                {turns.length === 0 ? (
                  <MessageScrollerItem className="flex min-h-full flex-1">
                    <Empty className="min-h-full">
                      <EmptyMedia variant="icon">
                        <SearchIcon />
                      </EmptyMedia>
                      <EmptyHeader>
                        <EmptyTitle>Ask the map</EmptyTitle>
                        <EmptyDescription>
                          Every answer is looked up in the parsed files and
                          edges; nothing is recalled.
                        </EmptyDescription>
                      </EmptyHeader>
                      <EmptyContent>
                        {EXAMPLES.map((example) => (
                          <Button
                            key={example}
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-auto w-full justify-start px-2 py-1.5 text-left text-[11px] whitespace-normal"
                            onClick={() => void send(example)}
                          >
                            {example}
                          </Button>
                        ))}
                      </EmptyContent>
                    </Empty>
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
        className="min-w-0 shrink-0 border-t border-border p-2"
      >
        <div className="mb-1 flex min-w-0 items-center gap-1.5 text-[10px] text-muted-foreground">
          <span>about</span>
          <span className="truncate font-mono text-foreground">
            {context === null ? "the repository" : context.path}
          </span>
        </div>
        <InputGroup className="min-w-0">
          <InputGroupTextarea
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
            placeholder="Ask about this repository…"
            className="max-h-40 min-h-11 text-[11px]"
          />
          <InputGroupAddon align="block-end">
            <InputGroupButton
              type="submit"
              variant="secondary"
              size="sm"
              className="ml-auto"
              disabled={busy || draft.trim() === ""}
            >
              {busy ? "Asking" : "Send"}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
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
    <div className="flex min-w-0 flex-col gap-2">
      <Message align="end">
        <MessageContent>
          <MessageHeader>question</MessageHeader>
          <Bubble variant="muted" align="end">
            <BubbleContent className="text-[11px] leading-[1.45] whitespace-pre-wrap">
              {turn.question}
            </BubbleContent>
          </Bubble>
          {turn.context !== null ? (
            <MessageFooter>
              <span className="min-w-0 truncate font-mono text-[10px]">
                {turn.context.kind}: {turn.context.path}
              </span>
            </MessageFooter>
          ) : null}
        </MessageContent>
      </Message>

      <Message align="start">
        <MessageContent>
          <MessageHeader>answer</MessageHeader>

          {turn.tools.length > 0 ? (
            <LookupTrace tools={turn.tools} />
          ) : turn.status === "streaming" && turn.answer === "" ? (
            <Trace>
              <TraceLine>
                <TraceIcon>
                  <CircleDotIcon />
                </TraceIcon>
                <TraceTitle>Looking</TraceTitle>
              </TraceLine>
            </Trace>
          ) : null}

          {turn.answer !== "" ? (
            <Bubble variant="ghost" align="start" className="max-w-full">
              <BubbleContent className="text-[11px]">
                <ExplanationBody
                  body={turn.answer}
                  filePaths={filePaths}
                  folderIds={folderIds}
                  onReveal={onReveal}
                  onRevealFolder={onRevealFolder}
                  onHover={onHover}
                />
              </BubbleContent>
            </Bubble>
          ) : null}

          {turn.error !== null ? (
            <Alert variant="destructive">
              <AlertTitle>Agent error</AlertTitle>
              <AlertDescription className="font-mono text-[10.5px] wrap-break-word">
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
        </MessageContent>
      </Message>
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
              <TraceDescription>{latest.name}</TraceDescription>
            ) : null}
          </TraceLine>
        </TraceCollapsibleTrigger>
        <TraceCollapsibleContent>
          <Trace>
            {tools.map((tool) => (
              <LookupRow key={tool.id} tool={tool} />
            ))}
          </Trace>
        </TraceCollapsibleContent>
      </TraceCollapsible>
    </Trace>
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
    return <XIcon />;
  }
  if (status === "running") {
    return <CircleDotIcon />;
  }
  return <CheckIcon />;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
