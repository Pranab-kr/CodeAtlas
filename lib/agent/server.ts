import { env } from "@/lib/env";

export class AgentServerError extends Error {
  override name = "AgentServerError";
  readonly status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

export interface AgentServerConfig {
  url: string;
  assistantId: string;
  apiKey: string | null;
}

export function agentServerConfig(): AgentServerConfig | null {
  if (env.agentUrl === null || env.agentAssistantId === null) {
    return null;
  }
  return {
    url: env.agentUrl.replace(/\/+$/, ""),
    assistantId: env.agentAssistantId,
    apiKey: env.agentApiKey,
  };
}

export interface AgentThread {
  metadata: Record<string, unknown>;
}

export async function createAgentThread(
  config: AgentServerConfig,
  metadata: { analysis_id: string; organization_id: string },
  signal: AbortSignal,
): Promise<string> {
  const response = await request(config, "/threads", {
    method: "POST",
    body: JSON.stringify({ metadata }),
    signal,
  });

  if (!response.ok) {
    throw new AgentServerError(
      "The agent isn't reachable. The map and explanations still work.",
      503,
    );
  }

  const body: unknown = await response.json();
  if (!isRecord(body) || typeof body.thread_id !== "string") {
    throw new AgentServerError("The agent did not return a conversation.", 502);
  }
  return body.thread_id;
}

/**
 * A thread id is not a capability: the caller can name any thread, so the
 * metadata written when it was created is checked before it is continued.
 */
export async function readAgentThread(
  config: AgentServerConfig,
  threadId: string,
  signal: AbortSignal,
): Promise<AgentThread | null> {
  const response = await request(
    config,
    `/threads/${encodeURIComponent(threadId)}`,
    { method: "GET", signal },
  );

  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new AgentServerError(
      "The agent isn't reachable. The map and explanations still work.",
      503,
    );
  }

  const body: unknown = await response.json();
  if (!isRecord(body)) {
    return { metadata: {} };
  }
  return {
    metadata: isRecord(body.metadata) ? body.metadata : {},
  };
}

export async function startAgentRun(
  config: AgentServerConfig,
  threadId: string,
  message: string,
  credential: string,
  signal: AbortSignal,
): Promise<Response> {
  const response = await request(
    config,
    `/threads/${encodeURIComponent(threadId)}/runs/stream`,
    {
      method: "POST",
      signal,
      headers: { Accept: "text/event-stream" },
      body: JSON.stringify({
        assistant_id: config.assistantId,
        input: { messages: [{ role: "user", content: message }] },
        // The model never sees this. The tools send it back as a bearer
        // credential, and the database reads it to find the analysis.
        context: { credential },
        // The model's token stream mixes narration with the answer. Updates
        // carry each tool result and the final message; the translator picks
        // the answer out of the last one.
        stream_mode: "updates",
      }),
    },
  );

  if (!response.ok) {
    const detail = await safeText(response);
    console.error(
      `The agent rejected the run (${response.status}): ${detail}`,
    );
    throw new AgentServerError(
      "The agent could not start this question.",
      502,
    );
  }

  return response;
}

async function request(
  config: AgentServerConfig,
  path: string,
  init: RequestInit,
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (config.apiKey !== null) {
    headers.set("x-api-key", config.apiKey);
  }

  try {
    return await fetch(`${config.url}${path}`, {
      ...init,
      headers,
      cache: "no-store",
    });
  } catch (error) {
    if (isAbort(error)) {
      throw error;
    }
    console.error(
      "Reaching the agent failed:",
      error instanceof Error ? error.message : String(error),
    );
    throw new AgentServerError(
      "The agent isn't reachable. The map and explanations still work.",
      503,
    );
  }
}

async function safeText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 1_000);
  } catch {
    return "no detail";
  }
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
