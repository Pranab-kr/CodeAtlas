import OpenAI from "openai";
import { wrapOpenAI } from "langsmith/wrappers";

import { env } from "@/lib/env";

export class AiNotConfiguredError extends Error {
  override name = "AiNotConfiguredError";
}

interface AiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

function aiConfig(): AiConfig {
  const baseUrl = env.aiBaseUrl;
  const apiKey = env.aiApiKey;
  const model = env.aiModel;

  if (!baseUrl || !apiKey || !model) {
    throw new AiNotConfiguredError(
      "AI is not configured. Set AI_BASE_URL, AI_API_KEY and AI_MODEL in .env.local.",
    );
  }

  return { baseUrl, apiKey, model };
}

type TracedOpenAI = ReturnType<typeof wrapOpenAI<OpenAI>>;

let client: TracedOpenAI | null = null;

/**
 * The one construction site. Every model call in the app goes through this
 * client, so a call that skipped tracing would have to skip this file too.
 *
 * It is always wrapped. LangSmith decides whether to send from
 * LANGSMITH_TRACING, so an unconfigured trace leaves the call working; the
 * interface says tracing is off instead of pretending the run was recorded.
 */
export function aiClient(): TracedOpenAI {
  if (client) {
    return client;
  }

  const { baseUrl, apiKey } = aiConfig();
  const openai = new OpenAI({
    apiKey,
    baseURL: baseUrl,
    timeout: 90_000,
    maxRetries: 1,
    defaultHeaders: { "X-Title": "CodeAtlas" },
  });

  client = wrapOpenAI(openai, { metadata: { app: "code-atlas" } });

  return client;
}

/** The pinned model identifier. Changing it changes every cache key. */
export function aiModel(): string {
  return aiConfig().model;
}
