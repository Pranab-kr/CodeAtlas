import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import {
  AgentCredentialError,
  AgentReadError,
  readAgentSource,
  type AgentSource,
} from "@/lib/agent/read";
import { runAgent, type AgentHistoryMessage } from "@/lib/agent/run";
import type { AskEvent } from "@/lib/agent/stream";
import { env } from "@/lib/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY = 96_000;
const MAX_MESSAGE = 4_000;
const MAX_SELECTION = 1_000;
const MAX_HISTORY_MESSAGES = 20;
const MAX_HISTORY_MESSAGE_CHARS = 4_000;
const MAX_HISTORY_TOTAL_CHARS = 40_000;

type SelectionHint =
  | { kind: "file"; path: string }
  | { kind: "folder"; path: string };

interface ChatRequest {
  analysisId: string;
  message: string;
  history: AgentHistoryMessage[];
  selection: SelectionHint | null;
}

/**
 * The Ask entry point. It proves the asker can see the analysis, mints the
 * database-signed credential that names it, loads the read-only analysis once
 * through that credential, and streams tool lookups and the final answer back
 * as SSE events.
 */
export async function POST(request: Request): Promise<Response> {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY) {
    return fail(413, "The request is too large.");
  }

  let body: unknown;
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > MAX_BODY) {
      return fail(413, "The request is too large.");
    }
    body = JSON.parse(raw);
  } catch {
    return fail(400, "The request is not JSON.");
  }

  const parsed = parseChatRequest(body);
  if (typeof parsed === "string") {
    return fail(400, parsed);
  }

  const { userId, orgId } = await auth();
  if (!userId) {
    return fail(401, "Sign in to ask about this analysis.");
  }
  if (!orgId) {
    return fail(403, "No active organization for this session.");
  }

  if (!env.aiConfigured) {
    return fail(
      503,
      process.env.NODE_ENV === "production"
        ? "Ask is not enabled on this deployment."
        : "AI is not configured. Set AI_BASE_URL, AI_API_KEY and AI_MODEL in .env.local.",
    );
  }

  const supabase = await createServerSupabaseClient();
  const { data: analysis, error } = await supabase
    .from("analyses")
    .select("id, status")
    .eq("id", parsed.analysisId)
    .maybeSingle();

  if (error) {
    console.error("Reading the analysis for Ask failed:", error.message);
    return fail(500, "Could not read this analysis.");
  }
  if (!analysis || analysis.status !== "succeeded") {
    return fail(404, "That analysis isn't available in this workspace.");
  }

  const { data: credential, error: mintError } = await supabase.rpc(
    "agent_mint_credential",
    { p_analysis_id: parsed.analysisId },
  );

  if (mintError || typeof credential !== "string") {
    console.error(
      "Minting the agent credential failed:",
      mintError?.message ?? "no credential returned",
    );
    return fail(500, "Could not open a conversation for this analysis.");
  }

  let source: AgentSource;
  try {
    source = await readAgentSource(credential);
  } catch (readError) {
    if (readError instanceof AgentCredentialError) {
      return fail(401, readError.message);
    }
    if (readError instanceof AgentReadError) {
      console.error("Reading the analysis source for Ask failed:", readError.message);
      return fail(502, "Could not load this analysis for Ask.");
    }
    console.error("Reading the analysis source for Ask failed:", readError);
    return fail(502, "Could not load this analysis for Ask.");
  }

  const hint = selectionHint(source, parsed.selection);
  const message =
    hint === null ? parsed.message : `${parsed.message}\n\n${hint}`;

  const stop = new AbortController();
  const forwardAbort = () => stop.abort();
  if (request.signal.aborted) {
    stop.abort();
  } else {
    request.signal.addEventListener("abort", forwardAbort, { once: true });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AskEvent) => {
        if (stop.signal.aborted) {
          return;
        }
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
          );
        } catch {
          // The browser already closed the stream.
        }
      };

      try {
        await runAgent({
          source,
          message,
          history: parsed.history,
          abortSignal: stop.signal,
          onEvent: send,
        });
      } catch (runError) {
        if (!stop.signal.aborted) {
          console.error(
            "Running the Ask agent failed:",
            runError instanceof Error ? runError.message : String(runError),
          );
          send({
            type: "error",
            message:
              "The agent stopped before it answered. The map and explanations still work.",
          });
          send({ type: "done" });
        }
      } finally {
        request.signal.removeEventListener("abort", forwardAbort);
        try {
          controller.close();
        } catch {
          // The browser already closed the stream.
        }
      }
    },
    cancel() {
      stop.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

function selectionHint(
  source: AgentSource,
  selection: SelectionHint | null,
): string | null {
  if (selection === null) {
    return null;
  }

  if (selection.kind === "file") {
    const found = source.map.files.find((file) => file.path === selection.path);
    return found ? `[Selected on the map: file ${safe(found.path)}]` : null;
  }

  if (selection.path === "." || selection.path.includes("\\")) {
    return null;
  }

  const prefix = `${selection.path}/`;
  const hasFile = source.map.files.some((file) => file.path.startsWith(prefix));
  return hasFile
    ? `[Selected on the map: folder ${safe(selection.path)}]`
    : null;
}

function parseChatRequest(value: unknown): ChatRequest | string {
  if (!isRecord(value)) {
    return "The request is not an object.";
  }

  if (typeof value.analysisId !== "string" || !UUID.test(value.analysisId)) {
    return "The analysis id is not valid.";
  }

  const message =
    typeof value.message === "string" ? value.message.trim() : "";
  if (message === "" || message.length > MAX_MESSAGE) {
    return `A question must be 1-${MAX_MESSAGE} characters.`;
  }

  const history = parseHistory(value.history);
  if (typeof history === "string") {
    return history;
  }

  const selection = parseSelection(value.selection);
  if (selection === "invalid") {
    return "The selected item is not valid.";
  }

  return {
    analysisId: value.analysisId,
    message,
    history,
    selection,
  };
}

function parseHistory(value: unknown): AgentHistoryMessage[] | string {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    return "The conversation history must be a list.";
  }
  if (value.length > MAX_HISTORY_MESSAGES) {
    return `Conversation history may contain at most ${MAX_HISTORY_MESSAGES} messages.`;
  }

  const messages: AgentHistoryMessage[] = [];
  let totalChars = 0;

  for (const entry of value) {
    if (!isRecord(entry)) {
      return "A conversation history message is not an object.";
    }
    const role = entry.role;
    if (role !== "user" && role !== "assistant") {
      return "A conversation history message has an invalid role.";
    }
    if (typeof entry.content !== "string") {
      return "A conversation history message has invalid content.";
    }
    const content = entry.content.trim();
    if (content === "" || content.length > MAX_HISTORY_MESSAGE_CHARS) {
      return `Each conversation history message must be 1-${MAX_HISTORY_MESSAGE_CHARS} characters.`;
    }
    totalChars += content.length;
    if (totalChars > MAX_HISTORY_TOTAL_CHARS) {
      return `Conversation history exceeds ${MAX_HISTORY_TOTAL_CHARS} characters.`;
    }
    messages.push({ role, content });
  }

  return messages;
}

function parseSelection(
  value: unknown,
): SelectionHint | null | "invalid" {
  if (value === undefined || value === null) {
    return null;
  }
  if (!isRecord(value)) {
    return "invalid";
  }

  const kind = value.kind;
  const path = value.path;
  if (kind !== "file" && kind !== "folder") {
    return "invalid";
  }
  if (typeof path !== "string") {
    return "invalid";
  }

  const clean = path.trim();
  if (
    clean === "" ||
    clean.length > MAX_SELECTION ||
    /[\r\n]/.test(clean)
  ) {
    return "invalid";
  }

  return { kind, path: clean };
}

function safe(path: string): string {
  return path.replace(/[\r\n]/g, " ");
}

function fail(status: number, message: string): Response {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
