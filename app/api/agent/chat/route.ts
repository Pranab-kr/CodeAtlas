import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import {
  agentServerConfig,
  AgentServerError,
  createAgentThread,
  readAgentThread,
  startAgentRun,
  type AgentServerConfig,
} from "@/lib/agent/server";
import { parseSse } from "@/lib/agent/sse";
import { AgentStreamTranslator, type AskEvent } from "@/lib/agent/stream";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_MESSAGE = 4_000;
const MAX_SELECTION = 1_000;

type SelectionHint =
  | { kind: "file"; path: string }
  | { kind: "folder"; path: string };

interface ChatRequest {
  analysisId: string;
  message: string;
  threadId: string | null;
  selection: SelectionHint | null;
}

type Supabase = Awaited<ReturnType<typeof createServerSupabaseClient>>;

/**
 * The Ask entry point. It proves the asker can see the analysis, mints the
 * credential that names it, opens or continues a conversation, and relays the
 * runtime's stream back as the small set of events the panel draws.
 */
export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
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

  const config = agentServerConfig();
  if (config === null) {
    return fail(
      503,
      "The agent isn't configured. Set AGENT_URL and AGENT_ASSISTANT_ID.",
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

  let hint: string | null = null;
  try {
    hint = await selectionHint(supabase, parsed.analysisId, parsed.selection);
  } catch (error) {
    // A selected item that can't be checked is not a reason to lose the
    // question. The agent simply starts without it.
    console.error(
      "Checking the selected item failed:",
      error instanceof Error ? error.message : String(error),
    );
  }
  const message =
    hint === null ? parsed.message : `${parsed.message}\n\n${hint}`;

  const stop = new AbortController();
  const forwardAbort = () => stop.abort();
  if (request.signal.aborted) {
    stop.abort();
  } else {
    request.signal.addEventListener("abort", forwardAbort, { once: true });
  }

  let threadId: string;
  try {
    threadId = await resolveThread(
      config,
      parsed.threadId,
      parsed.analysisId,
      orgId,
      stop.signal,
    );
  } catch (error) {
    request.signal.removeEventListener("abort", forwardAbort);
    if (error instanceof AgentServerError) {
      return fail(error.status, error.message);
    }
    console.error("Opening the agent conversation failed:", error);
    return fail(502, "The agent could not open a conversation.");
  }

  let upstream: Response;
  try {
    upstream = await startAgentRun(
      config,
      threadId,
      message,
      credential,
      stop.signal,
    );
  } catch (error) {
    request.signal.removeEventListener("abort", forwardAbort);
    if (error instanceof AgentServerError) {
      return fail(error.status, error.message);
    }
    console.error("Starting the agent run failed:", error);
    return fail(502, "The agent could not start this question.");
  }

  const bodyStream = upstream.body;
  if (bodyStream === null) {
    request.signal.removeEventListener("abort", forwardAbort);
    return fail(502, "The agent returned no stream.");
  }

  const encoder = new TextEncoder();
  const translator = new AgentStreamTranslator();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AskEvent) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
        );
      };

      send({ type: "thread", threadId });
      let finished = false;

      try {
        for await (const frame of parseSse(bodyStream)) {
          const data =
            frame.data === "" ? null : jsonOrText(frame.data);
          for (const event of translator.translate(frame.event, data)) {
            if (event.type === "done") {
              finished = true;
            }
            send(event);
          }
        }
        if (!finished) {
          for (const event of translator.finish()) {
            send(event);
          }
        }
      } catch (error) {
        if (!stop.signal.aborted) {
          console.error(
            "Relaying the agent stream failed:",
            error instanceof Error ? error.message : String(error),
          );
          send({
            type: "error",
            message:
              "The agent stopped before it answered. The map and explanations still work.",
          });
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

async function resolveThread(
  config: AgentServerConfig,
  threadId: string | null,
  analysisId: string,
  organizationId: string,
  signal: AbortSignal,
): Promise<string> {
  if (threadId !== null) {
    const thread = await readAgentThread(config, threadId, signal);
    if (thread !== null) {
      if (Object.keys(thread.metadata).length === 0) {
        // A thread we didn't create. Starting a new one is safer than
        // continuing a history with an unknown scope.
        return createAgentThread(
          config,
          { analysis_id: analysisId, organization_id: organizationId },
          signal,
        );
      }
      if (
        thread.metadata.analysis_id !== analysisId ||
        thread.metadata.organization_id !== organizationId
      ) {
        throw new AgentServerError(
          "That conversation belongs to a different analysis.",
          403,
        );
      }
      return threadId;
    }
  }

  return createAgentThread(
    config,
    { analysis_id: analysisId, organization_id: organizationId },
    signal,
  );
}

async function selectionHint(
  db: Supabase,
  analysisId: string,
  selection: SelectionHint | null,
): Promise<string | null> {
  if (selection === null) {
    return null;
  }

  if (selection.kind === "file") {
    const { data, error } = await db
      .from("files")
      .select("path")
      .eq("analysis_id", analysisId)
      .eq("path", selection.path)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }
    return data ? `[Selected on the map: file ${safe(data.path)}]` : null;
  }

  // A folder is a prefix of stored paths. Reject patterns so the check is a
  // membership test, not a wildcard the caller chose.
  if (
    selection.path === "." ||
    selection.path.includes("%") ||
    selection.path.includes("_")
  ) {
    return null;
  }

  const { data, error } = await db
    .from("files")
    .select("path")
    .eq("analysis_id", analysisId)
    .like("path", `${selection.path}/%`)
    .limit(1);

  if (error) {
    throw new Error(error.message);
  }
  return data.length > 0
    ? `[Selected on the map: folder ${safe(selection.path)}]`
    : null;
}

function parseChatRequest(
  value: unknown,
): ChatRequest | string {
  if (!isRecord(value)) {
    return "The request is not an object.";
  }

  if (typeof value.analysisId !== "string" || !UUID.test(value.analysisId)) {
    return "The analysis id is not valid.";
  }

  const message = typeof value.message === "string" ? value.message.trim() : "";
  if (message === "" || message.length > MAX_MESSAGE) {
    return `A question must be 1-${MAX_MESSAGE} characters.`;
  }

  let threadId: string | null = null;
  if (value.threadId !== undefined && value.threadId !== null) {
    if (typeof value.threadId !== "string" || !UUID.test(value.threadId)) {
      return "The conversation id is not valid.";
    }
    threadId = value.threadId;
  }

  const selection = parseSelection(value.selection);
  if (selection === "invalid") {
    return "The selected item is not valid.";
  }

  return {
    analysisId: value.analysisId,
    message,
    threadId,
    selection,
  };
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

function jsonOrText(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
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
