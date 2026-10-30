import { aiClient, aiModel } from "@/lib/ai/client";
import { messageText } from "@/lib/ai/message";

import { withRetry } from "../retry";

export interface SpecificityJudgement {
  score: number;
  comment: string;
}

const SYSTEM = `You grade one explanation of a source file for specificity and usefulness to a developer who can read code.

Score 1 to 5:
1 — generic; it could describe almost any file.
2 — some concrete detail, but mostly generic.
3 — names real things but leaves the reader guessing how they fit.
4 — specific about what the file does and about its real neighbours.
5 — precise and useful, grounded in the names and connections it was given.

Judge specificity and usefulness, not writing style, length or confidence. Do not reward invented details. Return JSON only, with the reasoning first:
{"reasoning":"...","score":3}`;

/**
 * The prompt-version comparison needs a model as judge, because "is this
 * specific enough to be useful" has no exact answer. The score is therefore a
 * relative signal, not ground truth. Every call goes through the wrapped
 * client, so the judgement is traced like any other model call.
 */
export async function judgeSpecificity(input: {
  path: string;
  body: string;
}): Promise<SpecificityJudgement> {
  const completion = await withRetry(() =>
    aiClient().chat.completions.create({
      model: aiModel(),
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `File: ${input.path}\n\nExplanation:\n${input.body}`,
        },
      ],
      temperature: 0,
      max_tokens: 1_200,
      response_format: { type: "json_object" },
    }),
  );

  const text = messageText(completion.choices[0]?.message.content ?? null).trim();
  if (text === "") {
    throw new Error(
      `The judge returned no text (finish reason: ${completion.choices[0]?.finish_reason ?? "unknown"}).`,
    );
  }

  let parsed: unknown;
  try {
    // JSON mode is asked for, but a fence is a common way to disobey it.
    const cleaned = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "");
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`The judge returned invalid JSON: ${text.slice(0, 200)}`);
  }

  const record = asRecord(parsed);
  if (record === null || typeof record.score !== "number" || !Number.isFinite(record.score)) {
    throw new Error(`The judge returned no numeric score: ${text.slice(0, 200)}`);
  }

  const score = Math.min(5, Math.max(1, record.score));
  const comment =
    typeof record.reasoning === "string"
      ? record.reasoning.slice(0, 600)
      : "";

  return { score, comment };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
