import { tool, type ToolRuntime } from "langchain";
import { z } from "zod";

/**
 * The agent never receives the analysis id. The run's context carries an
 * opaque credential; these tools pass it back to the read-only tool surface,
 * which is the only thing that can open it.
 */
type AtlasContext = {
  credential: string;
};

type AtlasRuntime = ToolRuntime<unknown, AtlasContext>;

type AtlasToolName =
  | "analysis_summary"
  | "search_files"
  | "list_files_by_role"
  | "file_neighbours"
  | "walk"
  | "routes";

const DEFAULT_TOOLS_URL =
  "http://127.0.0.1:3000/api/agent/tools";

async function call(
  runtime: AtlasRuntime,
  name: AtlasToolName,
  args: Record<string, unknown>,
): Promise<string> {
  const credential = runtime.context?.credential;
  if (typeof credential !== "string" || credential === "") {
    throw new Error(
      "This question has no repository credential. Open Ask from a mapped analysis.",
    );
  }

  const url =
    process.env.ATLAS_TOOLS_URL?.trim() || DEFAULT_TOOLS_URL;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${credential}`,
      },
      body: JSON.stringify({ tool: name, arguments: args }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new Error("The repository lookup service is unreachable.");
  }

  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      errorMessage(text) ?? `The ${name} lookup failed.`,
    );
  }
  return text;
}

function errorMessage(text: string): string | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "error" in parsed &&
      typeof parsed.error === "string"
    ) {
      return parsed.error;
    }
  } catch {
    // A proxy error page is not JSON; fall through.
  }
  const trimmed = text.trim();
  return trimmed === "" ? null : trimmed.slice(0, 300);
}

export const analysisSummary = tool(
  async (_input: Record<string, never>, runtime: AtlasRuntime) =>
    call(runtime, "analysis_summary", {}),
  {
    name: "analysis_summary",
    description:
      "Read the whole map at a glance: repository, framework, file, edge and route counts, parse coverage, the most depended-on files, the files nothing imports, import loops, and long files. Call this first for a broad question.",
    schema: z.object({}),
  },
);

export const searchFiles = tool(
  async (
    { query, limit }: { query: string; limit?: number },
    runtime: AtlasRuntime,
  ) => call(runtime, "search_files", { query, limit }),
  {
    name: "search_files",
    description:
      "Find exact file paths in the analysed repository by a case-insensitive part of the path. Use a filename or a directory fragment. Returns up to 50 paths with role, line count and fan counts. The paths returned are the only paths you may name.",
    schema: z.object({
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
  },
);

export const filesByRole = tool(
  async (
    { role, limit }: { role: string; limit?: number },
    runtime: AtlasRuntime,
  ) => call(runtime, "list_files_by_role", { role, limit }),
  {
    name: "list_files_by_role",
    description:
      "List files that convention assigned a role, most depended on first. Roles: page-route, api-endpoint, server-action, router, controller, resolver, gateway, layout, route-ui, service, module, entity, model, dto, repository, component, hook, util, middleware, guard, interceptor, pipe, filter, metadata, instrumentation, config, test. Use this for a question about a layer rather than a name.",
    schema: z.object({
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
  },
);

export const fileNeighbours = tool(
  async ({ path }: { path: string }, runtime: AtlasRuntime) =>
    call(runtime, "file_neighbours", { path }),
  {
    name: "file_neighbours",
    description:
      "Read the direct imports and importers of one exact stored path, with the kind of each edge (import, re-export, dynamic, require). This is the only source of a relationship; do not claim two files are connected without it.",
    schema: z.object({
      path: z
        .string()
        .min(1)
        .max(1000)
        .describe("An exact path returned by search_files or another tool."),
    }),
  },
);

export const walk = tool(
  async (
    {
      path,
      direction,
      depth,
    }: {
      path: string;
      direction: "dependents" | "dependencies";
      depth?: number;
    },
    runtime: AtlasRuntime,
  ) => call(runtime, "walk", { path, direction, depth }),
  {
    name: "walk",
    description:
      "Walk real edges from one exact stored path. direction=dependents is the blast radius: what imports the file, directly or through others. direction=dependencies is what the file imports. Returns the files at each step and how many lie beyond the requested depth.",
    schema: z.object({
      path: z
        .string()
        .min(1)
        .max(1000)
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
  },
);

export const routes = tool(
  async (_input: Record<string, never>, runtime: AtlasRuntime) =>
    call(runtime, "routes", {}),
  {
    name: "routes",
    description:
      "Read the stored route table: HTTP method, full pattern, declaring file and line. Only routes whose method and full pattern were recovered from the syntax are present. Also reports how many route declarations the parser omitted.",
    schema: z.object({}),
  },
);
