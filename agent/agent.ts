import { defineDeepAgent } from "managed-deepagents";
import { z } from "zod";

import {
  analysisSummary,
  fileNeighbours,
  filesByRole,
  routes,
  searchFiles,
  walk,
} from "./tools/atlas.js";
import { atlasOnly } from "./middleware/atlas-only.js";

/**
 * Runtime context is application data, not model input. The credential names
 * one analysis and one organization inside the database; the model never sees
 * the analysis id and the tools never decode the token.
 */
const contextSchema = z.object({
  credential: z
    .string()
    .describe(
      "Opaque credential for the current analysis. Never decode or mention it.",
    ),
});

const configuredModel = process.env.AGENT_MODEL?.trim();
const providerModel = process.env.AI_MODEL?.trim() || "gpt-4.1-mini";

export const agent = defineDeepAgent({
  name: "code-atlas-agent",
  model:
    configuredModel === undefined || configuredModel === ""
      ? `openai:${providerModel}`
      : configuredModel,
  tools: [
    analysisSummary,
    searchFiles,
    filesByRole,
    fileNeighbours,
    walk,
    routes,
  ],
  middleware: [atlasOnly],
  contextSchema,
});
