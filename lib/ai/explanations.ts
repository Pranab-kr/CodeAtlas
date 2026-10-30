import type { SupabaseClient } from "@supabase/supabase-js";
import { traceable } from "langsmith/traceable";

import { env } from "@/lib/env";
import { createPipelineSupabaseClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import type { Repository } from "@/lib/pipeline/github";

import { aiClient, aiModel } from "./client";
import type { FileContext, FolderContext } from "./context";
import {
  fileAllowedPaths,
  folderAllowedPaths,
  inventedPaths,
} from "./invented-paths";
import { messageText } from "./message";
import {
  buildFilePrompt,
  buildFolderPrompt,
  EXPLAIN_FILE_PROMPT_VERSION,
  EXPLAIN_FOLDER_PROMPT_VERSION,
  fileSystemPrompt,
  folderSystemPrompt,
} from "./prompts";
import { fetchFileAt } from "./source";
import {
  markAllowedPaths,
  markCache,
  recordInventedPaths,
} from "./trace";

type Db = SupabaseClient<Database>;

const MAX_SOURCE_CHARS = 200_000;

export interface Explanation {
  body: string;
  cached: boolean;
  warning: string | null;
}

interface ExplainFileRequest {
  db: Db;
  analysisId: string;
  organizationId: string;
  file: FileContext;
  repository: Repository;
  commitSha: string;
}

interface ExplainFolderRequest {
  db: Db;
  analysisId: string;
  organizationId: string;
  folder: FolderContext;
}

/**
 * The cache read is deliberately inside this traced function. A hit returns
 * before any model call, so its LangSmith run contains no LLM child and no
 * tokens; a miss contains both. That is what makes the cache checkable.
 */
export const explainFile = traceable(
  async (request: ExplainFileRequest): Promise<Explanation> => {
    const model = aiModel();
    const cached = await readFileCache(request, model);
    markCache(cached !== null);

    if (cached !== null) {
      return { body: cached, cached: true, warning: null };
    }

    const fetched = await fetchFileAt(
      request.repository,
      request.commitSha,
      request.file.path,
    );

    if (fetched.hash !== request.file.contentHash) {
      throw new Error(
        `${request.file.path} at commit ${request.commitSha.slice(0, 7)} does not match the analysed content. Run the analysis again.`,
      );
    }

    if (fetched.source.length > MAX_SOURCE_CHARS) {
      throw new Error(
        `${request.file.path} is ${fetched.source.length.toLocaleString("en")} characters, over the ${MAX_SOURCE_CHARS.toLocaleString("en")}-character limit for one explanation.`,
      );
    }

    const allowed = fileAllowedPaths(request.file, fetched.source);
    markAllowedPaths(allowed);

    const body = await generateFile(request.file, fetched.source, model);
    await recordInventedPaths(inventedPaths(body, allowed), allowed.length);
    const warning = await writeFileCache(request, model, body);

    return { body, cached: false, warning };
  },
  {
    name: "explain-file",
    run_type: "chain",
    metadata: { prompt_version: EXPLAIN_FILE_PROMPT_VERSION },
    tags: ["phase-10", "explain", "file"],
    processInputs: ({ analysisId, file }) => ({
      analysis_id: analysisId,
      path: file.path,
      model: env.aiModel ?? "none",
      prompt_version: EXPLAIN_FILE_PROMPT_VERSION,
    }),
  },
);

export const explainFolder = traceable(
  async (request: ExplainFolderRequest): Promise<Explanation> => {
    const model = aiModel();
    const cached = await readFolderCache(request, model);
    markCache(cached !== null);

    if (cached !== null) {
      return { body: cached, cached: true, warning: null };
    }

    const allowed = folderAllowedPaths(request.folder);
    markAllowedPaths(allowed);

    const body = await generateFolder(request.folder, model);
    await recordInventedPaths(inventedPaths(body, allowed), allowed.length);
    const warning = await writeFolderCache(request, model, body);

    return { body, cached: false, warning };
  },
  {
    name: "explain-folder",
    run_type: "chain",
    metadata: { prompt_version: EXPLAIN_FOLDER_PROMPT_VERSION },
    tags: ["phase-10", "explain", "folder"],
    processInputs: ({ analysisId, folder }) => ({
      analysis_id: analysisId,
      folder: folder.id,
      files: folder.files.length,
      model: env.aiModel ?? "none",
      prompt_version: EXPLAIN_FOLDER_PROMPT_VERSION,
    }),
  },
);

async function generateFile(
  file: FileContext,
  source: string,
  model: string,
): Promise<string> {
  const completion = await aiClient().chat.completions.create(
    {
      model,
      messages: [
        { role: "system", content: fileSystemPrompt() },
        {
          role: "user",
          content: buildFilePrompt({ ...file, source }),
        },
      ],
      temperature: 0.2,
      max_tokens: 1_200,
    },
    {
      langsmithExtra: {
        metadata: {
          prompt_version: EXPLAIN_FILE_PROMPT_VERSION,
          model,
          path: file.path,
        },
      },
    },
  );

  const choice = completion.choices[0];
  return requireText(
    choice?.message.content ?? null,
    choice?.finish_reason,
    choice?.message,
  );
}

async function generateFolder(
  folder: FolderContext,
  model: string,
): Promise<string> {
  const completion = await aiClient().chat.completions.create(
    {
      model,
      messages: [
        { role: "system", content: folderSystemPrompt() },
        { role: "user", content: buildFolderPrompt(folder) },
      ],
      temperature: 0.2,
      max_tokens: 900,
    },
    {
      langsmithExtra: {
        metadata: {
          prompt_version: EXPLAIN_FOLDER_PROMPT_VERSION,
          model,
          folder: folder.id,
        },
      },
    },
  );

  const choice = completion.choices[0];
  return requireText(
    choice?.message.content ?? null,
    choice?.finish_reason,
    choice?.message,
  );
}

function requireText(
  content: Parameters<typeof messageText>[0],
  finishReason: string | null | undefined,
  message: unknown,
): string {
  const text = messageText(content).trim();
  if (text !== "") {
    return text;
  }

  const reasoning = hasReasoning(message);
  throw new Error(
    `The model returned an empty explanation (finish reason: ${finishReason ?? "unknown"}).` +
      (reasoning
        ? " It returned reasoning but no final text; use a model that returns content."
        : " Use a model that returns a text completion."),
  );
}

function hasReasoning(message: unknown): boolean {
  if (typeof message !== "object" || message === null) {
    return false;
  }
  const reasoning = Reflect.get(message, "reasoning");
  return typeof reasoning === "string" && reasoning.trim() !== "";
}

async function readFileCache(
  request: ExplainFileRequest,
  model: string,
): Promise<string | null> {
  const { data, error } = await request.db
    .from("explanations")
    .select("body")
    .eq("analysis_id", request.analysisId)
    .eq("file_id", request.file.id)
    .eq("content_hash", request.file.contentHash)
    .eq("prompt_version", EXPLAIN_FILE_PROMPT_VERSION)
    .eq("model", model)
    .maybeSingle();

  if (error) {
    throw new Error(`Reading the explanation cache failed: ${error.message}`);
  }

  return data?.body ?? null;
}

async function readFolderCache(
  request: ExplainFolderRequest,
  model: string,
): Promise<string | null> {
  const { data, error } = await request.db
    .from("explanations")
    .select("body")
    .eq("analysis_id", request.analysisId)
    .eq("folder_path", request.folder.id)
    .eq("content_hash", request.folder.contentHash)
    .eq("prompt_version", EXPLAIN_FOLDER_PROMPT_VERSION)
    .eq("model", model)
    .maybeSingle();

  if (error) {
    throw new Error(`Reading the explanation cache failed: ${error.message}`);
  }

  return data?.body ?? null;
}

// Cache writes use the pipeline's secret key. A member can read the cache
// through the policy, but must not be able to plant an answer in it.
async function writeFileCache(
  request: ExplainFileRequest,
  model: string,
  body: string,
): Promise<string | null> {
  const writer = createPipelineSupabaseClient();
  const { error } = await writer.from("explanations").insert({
    organization_id: request.organizationId,
    analysis_id: request.analysisId,
    target_kind: "file",
    file_id: request.file.id,
    folder_path: null,
    content_hash: request.file.contentHash,
    prompt_version: EXPLAIN_FILE_PROMPT_VERSION,
    model,
    body,
  });

  return cacheWarning(error);
}

async function writeFolderCache(
  request: ExplainFolderRequest,
  model: string,
  body: string,
): Promise<string | null> {
  const writer = createPipelineSupabaseClient();
  const { error } = await writer.from("explanations").insert({
    organization_id: request.organizationId,
    analysis_id: request.analysisId,
    target_kind: "folder",
    file_id: null,
    folder_path: request.folder.id,
    content_hash: request.folder.contentHash,
    prompt_version: EXPLAIN_FOLDER_PROMPT_VERSION,
    model,
    body,
  });

  return cacheWarning(error);
}

function cacheWarning(
  error: { code: string; message: string } | null,
): string | null {
  if (!error) {
    return null;
  }
  // Another request stored the same key first. The answer is still correct.
  if (error.code === "23505") {
    return null;
  }
  return `The explanation was not cached: ${error.message}`;
}
