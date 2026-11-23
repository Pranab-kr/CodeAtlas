import { createOpenAI, type OpenAIProvider } from "@ai-sdk/openai";
import {
  generateText,
  streamText,
  type LanguageModel,
  type ModelMessage,
  type StopCondition,
  type StreamTextOnErrorCallback,
  type Telemetry,
  type ToolSet,
} from "ai";
import { LangSmithTelemetry } from "langsmith/experimental/vercel";

import { env } from "@/lib/env";

export class AiNotConfiguredError extends Error {
  override name = "AiNotConfiguredError";
}

interface AiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

// A free provider can take well over a minute on a long file. Timing out early
// makes the SDK retry, and the provider then rejects the retry as a duplicate
// while the first request is still running.
const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_MAX_RETRIES = 1;

function aiConfig(): AiConfig {
  const baseUrl = env.aiBaseUrl;
  const apiKey = env.aiApiKey;
  const model = env.aiModel;

  if (!baseUrl || !apiKey || !model) {
    throw new AiNotConfiguredError(
      process.env.NODE_ENV === "production"
        ? "AI features are not enabled on this deployment."
        : "AI is not configured. Set AI_BASE_URL, AI_API_KEY and AI_MODEL in .env.local.",
    );
  }

  return { baseUrl, apiKey, model };
}

let cachedProvider: OpenAIProvider | null = null;

function aiProvider(): OpenAIProvider {
  if (cachedProvider) {
    return cachedProvider;
  }

  const { baseUrl, apiKey } = aiConfig();
  cachedProvider = createOpenAI({
    baseURL: baseUrl,
    apiKey,
    headers: { "X-Title": "CodeAtlas" },
  });

  return cachedProvider;
}

/**
 * Always use the Chat Completions API (`provider.chat(model)`) rather than the
 * Responses API so any custom OpenAI-compatible AI_BASE_URL works reliably.
 */
function chatModel(): LanguageModel {
  const { model } = aiConfig();
  return aiProvider().chat(model);
}

function langSmithIntegration(
  metadata?: Record<string, unknown>,
): Telemetry {
  const integration: Telemetry = LangSmithTelemetry({
    metadata: { app: "code-atlas", ...metadata },
  });
  return integration;
}

type PromptInput =
  | { prompt: string; messages?: never }
  | { messages: ModelMessage[]; prompt?: never };

export type AiGenerateTextOptions = PromptInput & {
  system?: string;
  temperature?: number;
  maxOutputTokens?: number;
  abortSignal?: AbortSignal;
  maxRetries?: number;
  timeout?: number;
  metadata?: Record<string, unknown>;
};

export type AiStreamTextOptions<TOOLS extends ToolSet = Record<string, never>> =
  PromptInput & {
    system?: string;
    tools?: TOOLS;
    stopWhen?: StopCondition<TOOLS> | Array<StopCondition<TOOLS>>;
    temperature?: number;
    maxOutputTokens?: number;
    abortSignal?: AbortSignal;
    maxRetries?: number;
    timeout?: number;
    onError?: StreamTextOnErrorCallback;
    metadata?: Record<string, unknown>;
  };

/**
 * The one construction site for non-streaming model calls. Every call passes
 * through LangSmithTelemetry, which reads LANGSMITH_TRACING and becomes a
 * clean no-op when tracing is off.
 */
export function aiGenerateText(
  options: AiGenerateTextOptions,
): ReturnType<typeof generateText> {
  const shared = {
    model: chatModel(),
    system: options.system,
    temperature: options.temperature,
    maxOutputTokens: options.maxOutputTokens,
    abortSignal: options.abortSignal,
    maxRetries: options.maxRetries ?? DEFAULT_MAX_RETRIES,
    timeout: options.timeout ?? DEFAULT_TIMEOUT_MS,
    telemetry: {
      integrations: [langSmithIntegration(options.metadata)],
    },
  };

  if (options.messages !== undefined) {
    return generateText({ ...shared, messages: options.messages });
  }
  return generateText({ ...shared, prompt: options.prompt });
}

/**
 * The one construction site for streaming model calls (including multi-step
 * tool calling for the Ask agent).
 */
export function aiStreamText<TOOLS extends ToolSet = Record<string, never>>(
  options: AiStreamTextOptions<TOOLS>,
): ReturnType<typeof streamText<TOOLS>> {
  const shared = {
    model: chatModel(),
    system: options.system,
    tools: options.tools,
    stopWhen: options.stopWhen,
    temperature: options.temperature,
    maxOutputTokens: options.maxOutputTokens,
    abortSignal: options.abortSignal,
    maxRetries: options.maxRetries ?? DEFAULT_MAX_RETRIES,
    timeout: options.timeout ?? DEFAULT_TIMEOUT_MS,
    onError: options.onError,
    telemetry: {
      integrations: [langSmithIntegration(options.metadata)],
    },
  };

  if (options.messages !== undefined) {
    return streamText<TOOLS>({ ...shared, messages: options.messages });
  }
  return streamText<TOOLS>({ ...shared, prompt: options.prompt });
}

/** The pinned model identifier. Changing it changes every cache key. */
export function aiModel(): string {
  return aiConfig().model;
}
