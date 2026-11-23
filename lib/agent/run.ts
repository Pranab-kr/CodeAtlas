import { stepCountIs, tool, type ModelMessage } from "ai";
import { traceable } from "langsmith/traceable";
import { z } from "zod";

import { aiModel, aiStreamText } from "@/lib/ai/client";
import { env } from "@/lib/env";

import { AGENT_INSTRUCTIONS } from "./instructions";
import type { AgentSource } from "./read";
import type { AskEvent } from "./stream";
import {
  parseAgentToolRequest,
  runAgentTool,
  type AgentToolName,
} from "./tools";

const MAX_STEPS = 8;
const MAX_TOOL_OUTPUT_CHARS = 1_000;

export interface AgentHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export interface RunAgentRequest {
  source: AgentSource;
  message: string;
  history?: readonly AgentHistoryMessage[];
  abortSignal?: AbortSignal;
  onEvent?(event: AskEvent): void;
}

export interface AgentToolOutcome {
  id: string;
  name: string;
  status: "success" | "error";
}

export interface RunAgentResult {
  text: string;
  tools: AgentToolOutcome[];
  error: string | null;
}

/**
 * Runs one Ask turn in-process against the already-loaded, credential-scoped
 * analysis map. The model never sees the analysis id or database credential;
 * it can only call the six read-only Atlas tools over `request.source`.
 */
export const runAgent = traceable(
  async (request: RunAgentRequest): Promise<RunAgentResult> => {
    const emit = (event: AskEvent) => {
      request.onEvent?.(event);
    };

    const messages: ModelMessage[] = [
      ...(request.history ?? []).map((entry) => ({
        role: entry.role,
        content: entry.content,
      })),
      { role: "user", content: request.message },
    ];

    const tools = buildAtlasTools(request.source);

    const stream = aiStreamText({
      system: AGENT_INSTRUCTIONS,
      messages,
      tools,
      stopWhen: stepCountIs(MAX_STEPS),
      temperature: 0.2,
      maxOutputTokens: 2_000,
      abortSignal: request.abortSignal,
      metadata: {
        repository: request.source.analysis.projectName,
        model: aiModel(),
      },
      // Stream errors are surfaced as `{ type: "error" }` parts on `fullStream`
      // and handled below rather than logged as unhandled callbacks.
      onError: () => {},
    });

    const toolOutcomes = new Map<string, AgentToolOutcome>();
    let stepText = "";
    let stepHasToolCalls = false;
    let finalAnswer = "";
    let streamError: string | null = null;

    for await (const part of stream.fullStream) {
      switch (part.type) {
        case "start-step":
          stepText = "";
          stepHasToolCalls = false;
          break;

        case "text-delta":
          stepText += part.text;
          break;

        case "tool-call":
          stepHasToolCalls = true;
          emit({
            type: "tool_start",
            id: part.toolCallId,
            name: part.toolName,
            arguments: part.input ?? null,
          });
          break;

        case "tool-result": {
          const content = stringifyOutput(part.output).slice(
            0,
            MAX_TOOL_OUTPUT_CHARS,
          );
          toolOutcomes.set(part.toolCallId, {
            id: part.toolCallId,
            name: part.toolName,
            status: "success",
          });
          emit({
            type: "tool_end",
            id: part.toolCallId,
            name: part.toolName,
            content,
            status: "success",
          });
          break;
        }

        case "tool-error": {
          const content = errorMessage(part.error).slice(
            0,
            MAX_TOOL_OUTPUT_CHARS,
          );
          toolOutcomes.set(part.toolCallId, {
            id: part.toolCallId,
            name: part.toolName,
            status: "error",
          });
          emit({
            type: "tool_end",
            id: part.toolCallId,
            name: part.toolName,
            content,
            status: "error",
          });
          break;
        }

        case "finish-step": {
          // A model often emits short narration before calling tools. Only a
          // step with no tool calls is part of the final answer shown to the
          // reader.
          if (!stepHasToolCalls) {
            const trimmed = stepText.trim();
            if (trimmed !== "") {
              finalAnswer =
                finalAnswer === "" ? trimmed : `${finalAnswer}\n\n${trimmed}`;
              emit({ type: "text", text: trimmed });
            }
          }
          stepText = "";
          stepHasToolCalls = false;
          break;
        }

        case "error": {
          if (!request.abortSignal?.aborted) {
            const message = errorMessage(part.error);
            streamError = message;
            emit({ type: "error", message });
          }
          break;
        }

        default:
          break;
      }
    }

    if (!request.abortSignal?.aborted) {
      emit({ type: "done" });
    }

    return {
      text: finalAnswer,
      tools: [...toolOutcomes.values()],
      error: streamError,
    };
  },
  {
    name: "ask-agent",
    run_type: "chain",
    tags: ["ask", "agent"],
    processInputs: ({ message, history, source }) => ({
      repository: source.analysis.projectName,
      framework: source.analysis.framework ?? "none",
      files: source.map.files.length,
      history_messages: history?.length ?? 0,
      message,
      model: env.aiModel ?? "none",
    }),
  },
);

function buildAtlasTools(source: AgentSource) {
  return {
    analysis_summary: tool({
      description:
        "Read the whole map at a glance: repository, framework, file, edge and route counts, parse coverage, the most depended-on files, the files nothing imports, import loops, and long files. Call this first for a broad question.",
      inputSchema: z.object({}),
      execute: async () => executeAtlasTool(source, "analysis_summary", {}),
    }),
    search_files: tool({
      description:
        "Find exact file paths in the analysed repository by a case-insensitive part of the path. Use a filename or a directory fragment. Returns up to 50 paths with role, line count and fan counts. The paths returned are the only paths you may name.",
      inputSchema: z.object({
        query: z
          .string()
          .min(1)
          .max(200)
          .describe("Part of a path, such as auth, src/routes, or page.tsx."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe("Maximum matches to return. Defaults to 20."),
      }),
      execute: async ({ query, limit }) =>
        executeAtlasTool(source, "search_files", { query, limit }),
    }),
    list_files_by_role: tool({
      description:
        "List files that convention assigned a role, most depended on first. Roles: page-route, api-endpoint, server-action, router, controller, resolver, gateway, layout, route-ui, service, module, entity, model, dto, repository, component, hook, util, middleware, guard, interceptor, pipe, filter, metadata, instrumentation, config, test. Use this for a question about a layer rather than a name.",
      inputSchema: z.object({
        role: z
          .string()
          .min(1)
          .max(64)
          .describe("One role id from the description, such as service."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe("Maximum files to return. Defaults to 50."),
      }),
      execute: async ({ role, limit }) =>
        executeAtlasTool(source, "list_files_by_role", { role, limit }),
    }),
    file_neighbours: tool({
      description:
        "Read the direct imports and importers of one exact stored path, with the kind of each edge (import, re-export, dynamic, require). This is the only source of a relationship; do not claim two files are connected without it.",
      inputSchema: z.object({
        path: z
          .string()
          .min(1)
          .max(1_000)
          .describe("An exact path returned by search_files or another tool."),
      }),
      execute: async ({ path }) =>
        executeAtlasTool(source, "file_neighbours", { path }),
    }),
    walk: tool({
      description:
        "Walk real edges from one exact stored path. direction=dependents is the blast radius: what imports the file, directly or through others. direction=dependencies is what the file imports. Returns the files at each step and how many lie beyond the requested depth.",
      inputSchema: z.object({
        path: z
          .string()
          .min(1)
          .max(1_000)
          .describe("An exact path returned by another tool."),
        direction: z
          .enum(["dependents", "dependencies"])
          .describe(
            "dependents for what imports this file; dependencies for what it imports.",
          ),
        depth: z
          .number()
          .int()
          .min(1)
          .max(5)
          .optional()
          .describe("Steps to walk. Defaults to 2."),
      }),
      execute: async ({ path, direction, depth }) =>
        executeAtlasTool(source, "walk", { path, direction, depth }),
    }),
    routes: tool({
      description:
        "Read the stored route table: HTTP method, full pattern, declaring file and line. Only routes whose method and full pattern were recovered from the syntax are present. Also reports how many route declarations the parser omitted.",
      inputSchema: z.object({}),
      execute: async () => executeAtlasTool(source, "routes", {}),
    }),
  };
}

function executeAtlasTool(
  source: AgentSource,
  name: AgentToolName,
  args: Record<string, unknown>,
): string {
  const parsed = parseAgentToolRequest({ tool: name, arguments: args });
  return JSON.stringify(runAgentTool(source, parsed));
}

function stringifyOutput(output: unknown): string {
  if (typeof output === "string") {
    return output;
  }
  try {
    return JSON.stringify(output);
  } catch {
    return String(output);
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim() !== "") {
    return error.message;
  }
  if (typeof error === "string" && error.trim() !== "") {
    return error;
  }
  return "The agent stopped with an error.";
}
