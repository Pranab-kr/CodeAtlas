import { Client } from "langsmith";
import { evaluate, type EvaluationResult } from "langsmith/evaluation";
import type { Dataset, Example, Run } from "langsmith/schemas";

import { aiClient, aiModel } from "../../lib/ai/client.ts";
import { messageText } from "../../lib/ai/message.ts";
import {
  buildFilePrompt,
  EXPLAIN_FILE_PROMPT_VERSION,
  fileSystemPrompt,
  type FilePromptContext,
  type NeighbourPrompt,
} from "../../lib/ai/prompts.ts";
import { fetchFileAt } from "../../lib/ai/source.ts";
import {
  loadMap,
  type StoredMap,
} from "../../lib/analysis/load.ts";
import { env } from "../../lib/env.ts";
import type { EdgeKind, ParsedFile } from "../../lib/parser/types.ts";
import { judgeSpecificity } from "../../evals/judges/specificity.ts";
import { withRetry } from "../../evals/retry.ts";
import {
  buildV0Prompt,
  EXPLAIN_FILE_V0_PROMPT_VERSION,
  v0SystemPrompt,
} from "../../evals/prompts/explain-file-v0.ts";
import {
  evalDb,
  mapLimit,
  messageOf,
  readAnalysisTargets,
  type AnalysisTarget,
} from "./shared.mts";

const DATASET_NAME = "code-atlas-explain-file-prompts";
const TARGET_COUNT = 10;
const CANDIDATE_COUNT = 40;
const MINIMUM = 10;
const PER_ANALYSIS = 8;
const SOURCE_CONCURRENCY = 5;
const EVALUATION_CONCURRENCY = 1;
const MAX_SOURCE_CHARS = 200_000;
const MAX_PROMPT_CHARS = 10_000;

const EDGE_KINDS: readonly EdgeKind[] = [
  "import",
  "reexport",
  "dynamic",
  "require",
];

interface Options {
  dryRun: boolean;
  help: boolean;
}

interface BuiltExample {
  inputs: FilePromptContext;
  reference_outputs: { path: string };
  metadata: { analysis_id: string; repository: string };
}

interface SelectedFile {
  target: AnalysisTarget;
  file: ParsedFile;
}

interface ExperimentSummary {
  label: string;
  promptVersion: string;
  experiment: string;
  mean: number;
  scored: number;
  total: number;
  /** Example id to specificity score. Failed evaluator calls are absent. */
  scores: ReadonlyMap<string, number>;
}

const USAGE = `Usage: pnpm eval:prompts [options]

Builds one LangSmith dataset from the analysed repositories, then runs the
current file-explanation prompt and the retired v0 prompt over it as two
separate experiments. A model judge scores specificity 1-5.

The first run creates the dataset. Later runs reuse it, so both prompts are
always measured on the same examples.

With the default 10 examples this makes 40 model calls: two generations and
two judge calls per example. Keep that inside your provider's daily limit.

Options:
  --dry-run   Build or read the dataset, print what it holds, run no models
  --help      Show this message`;

function parseOptions(argv: readonly string[]): Options {
  const options: Options = { dryRun: false, help: false };

  for (const argument of argv) {
    switch (argument) {
      case "--":
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown option: ${argument}`);
    }
  }

  return options;
}

async function main(): Promise<number> {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
    return 0;
  }

  if (!env.aiConfigured) {
    throw new Error(
      "AI is not configured. Set AI_BASE_URL, AI_API_KEY and AI_MODEL in .env.local.",
    );
  }

  const client = new Client();
  const dataset = await ensureDataset(client, options.dryRun);
  if (dataset === null) {
    return 0;
  }

  console.log(
    `\nRunning both prompts over "${dataset.name}" (${dataset.example_count ?? "?"} examples).`,
  );

  const v1 = await runExperiment(
    "v1",
    EXPLAIN_FILE_PROMPT_VERSION,
    currentPromptTarget,
    dataset.name,
  );
  const v0 = await runExperiment(
    "v0",
    EXPLAIN_FILE_V0_PROMPT_VERSION,
    retiredPromptTarget,
    dataset.name,
  );

  report(v1, v0);
  return 0;
}

async function ensureDataset(
  client: Client,
  dryRun: boolean,
): Promise<Dataset | null> {
  const existing = await readDataset(client);
  if (existing !== null) {
    const count = existing.example_count ?? 0;
    if (count === 0) {
      throw new Error(
        `Dataset "${existing.name}" exists but has no examples. Delete it in LangSmith and run this again.`,
      );
    }
    if (dryRun) {
      console.log(
        `Dry run: dataset "${existing.name}" has ${count} examples. No model was called.`,
      );
      return null;
    }
    console.log(
      `Reusing dataset "${existing.name}" (${count} examples).`,
    );
    return existing;
  }

  console.log("No dataset yet; building one from the analysed repositories.");
  const examples = await buildExamples();

  if (dryRun) {
    console.log(
      `Dry run: ${examples.length} examples ready. The dataset was not created and no model was called.`,
    );
    for (const example of examples) {
      const neighbours =
        example.inputs.imports.length + example.inputs.importedBy.length;
      console.log(
        `  ${example.inputs.path} — source ${example.inputs.source.length.toLocaleString("en")} chars, ${neighbours} neighbours, current prompt ${buildFilePrompt(example.inputs).length.toLocaleString("en")} chars`,
      );
    }
    return null;
  }

  const created = await client.createDataset(DATASET_NAME, {
    description:
      "One file context per example, used to compare the current and retired explanation prompts.",
    metadata: {
      purpose: "phase-11 prompt comparison",
      prompts: [EXPLAIN_FILE_PROMPT_VERSION, EXPLAIN_FILE_V0_PROMPT_VERSION],
    },
  });

  await client.createExamples(
    examples.map((example) => ({
      ...example,
      dataset_id: created.id,
    })),
  );

  const stored = await client.readDataset({ datasetId: created.id });
  console.log(
    `Created dataset "${stored.name}" with ${stored.example_count ?? examples.length} examples.`,
  );
  return stored;
}

async function readDataset(client: Client): Promise<Dataset | null> {
  const exists = await client.hasDataset({ datasetName: DATASET_NAME });
  if (!exists) {
    return null;
  }
  return client.readDataset({ datasetName: DATASET_NAME });
}

async function buildExamples(): Promise<BuiltExample[]> {
  const db = evalDb();
  const targets = await readAnalysisTargets(db);
  if (targets.length === 0) {
    throw new Error(
      "No succeeded analyses with a recorded commit. Analyse a repository first.",
    );
  }

  const groups: SelectedFile[][] = [];
  mapCache.clear();
  for (const target of targets) {
    const map = await mapFor(db, target);
    const ranked = [...map.files]
      .sort(
        (left, right) =>
          right.fanIn - left.fanIn ||
          right.fanOut - left.fanOut ||
          left.path.localeCompare(right.path),
      )
      .slice(0, PER_ANALYSIS)
      .map((file) => ({ target, file }));

    if (ranked.length > 0) {
      groups.push(ranked);
    }
  }

  const selected = roundRobin(groups, CANDIDATE_COUNT);
  if (selected.length === 0) {
    throw new Error("The analysed repositories have no files to sample.");
  }

  console.log(
    `Selected ${selected.length} candidates across ${groups.length} repositories; reading their source.`,
  );

  let skipped = 0;
  let done = 0;
  const loaded = await mapLimit(
    selected,
    SOURCE_CONCURRENCY,
    async ({ target, file }) => {
      try {
        const map = await mapFor(db, target);
        const context = contextFromMap(map, file.path);
        const fetched = await fetchFileAt(
          target.repository,
          target.commitSha,
          file.path,
        );

        if (fetched.hash !== context.contentHash) {
          skipped += 1;
          console.error(
            `Skipping ${file.path}: source no longer matches the analysed content.`,
          );
          return null;
        }
        if (fetched.source.length > MAX_SOURCE_CHARS) {
          skipped += 1;
          console.error(
            `Skipping ${file.path}: ${fetched.source.length.toLocaleString("en")} characters is over the one-explanation limit.`,
          );
          return null;
        }

        const inputs: FilePromptContext = {
          path: context.path,
          folder: context.folder,
          lines: context.lines,
          role: context.role,
          exports: context.exports,
          imports: context.imports,
          importedBy: context.importedBy,
          source: fetched.source,
        };

        const promptChars = buildFilePrompt(inputs).length;
        if (promptChars > MAX_PROMPT_CHARS) {
          skipped += 1;
          console.error(
            `Skipping ${file.path}: the current prompt is ${promptChars.toLocaleString("en")} characters, over the ${MAX_PROMPT_CHARS.toLocaleString("en")}-character evaluation budget.`,
          );
          return null;
        }

        const example: BuiltExample = {
          inputs,
          reference_outputs: { path: context.path },
          metadata: {
            analysis_id: target.id,
            repository: target.projectName,
          },
        };
        return example;
      } catch (error) {
        skipped += 1;
        console.error(`Skipping ${file.path}: ${messageOf(error)}`);
        return null;
      } finally {
        done += 1;
        if (done % 5 === 0 || done === selected.length) {
          console.log(`Read ${done}/${selected.length} source files`);
        }
      }
    },
  );

  const built = loaded.filter(
    (example): example is BuiltExample => example !== null,
  );
  const examples = built.slice(0, TARGET_COUNT);

  if (examples.length < MINIMUM) {
    throw new Error(
      `Only ${examples.length} examples could be built under the prompt budget; at least ${MINIMUM} are needed for a meaningful comparison.`,
    );
  }
  if (built.length > examples.length) {
    console.log(
      `${built.length - examples.length} fitting examples left unused after the first ${examples.length}.`,
    );
  }
  if (skipped > 0) {
    console.log(`${skipped} candidate${skipped === 1 ? "" : "s"} skipped.`);
  }

  return examples;
}

/**
 * The map is loaded once per repository in `buildExamples`, but the helper is
 * called per file. A small cache keeps that to one read per analysis.
 */
const mapCache = new Map<string, StoredMap>();

async function mapFor(
  db: ReturnType<typeof evalDb>,
  target: AnalysisTarget,
): Promise<StoredMap> {
  const cached = mapCache.get(target.id);
  if (cached !== undefined) {
    return cached;
  }
  const map = await loadMap(db, target.id);
  mapCache.set(target.id, map);
  return map;
}

interface MappedContext {
  path: string;
  folder: string;
  lines: number;
  role: string | null;
  exports: string[] | null;
  imports: NeighbourPrompt[];
  importedBy: NeighbourPrompt[];
  contentHash: string;
}

/**
 * The same context the application's loader builds, reconstructed from one
 * map read instead of four queries per file. Neighbours are every edge in
 * either direction, exactly as `loadFileContext` returns them.
 */
function contextFromMap(map: StoredMap, path: string): MappedContext {
  const byPath = new Map(map.files.map((file) => [file.path, file]));
  const target = byPath.get(path);
  if (!target) {
    throw new Error(`${path} is missing from the analysis map`);
  }

  const imports = neighbourRows(
    map.edges
      .filter((edge) => edge.source === path)
      .map((edge) => [edge.target, edge.kind] as const),
    byPath,
  );
  const importedBy = neighbourRows(
    map.edges
      .filter((edge) => edge.target === path)
      .map((edge) => [edge.source, edge.kind] as const),
    byPath,
  );

  return {
    path: target.path,
    folder: target.folder,
    lines: target.lines,
    role: target.role,
    exports: target.exports,
    imports,
    importedBy,
    contentHash: target.contentHash,
  };
}

function neighbourRows(
  pairs: readonly (readonly [string, EdgeKind])[],
  byPath: ReadonlyMap<string, ParsedFile>,
): NeighbourPrompt[] {
  const grouped = new Map<string, Set<EdgeKind>>();
  for (const [other, kind] of pairs) {
    const kinds = grouped.get(other) ?? new Set<EdgeKind>();
    kinds.add(kind);
    grouped.set(other, kinds);
  }

  return [...grouped.entries()]
    .map(([other, kinds]) => {
      const file = byPath.get(other);
      if (!file) {
        throw new Error(`${other} is missing from the analysis map`);
      }
      return {
        path: file.path,
        role: file.role,
        exports: file.exports,
        kinds: EDGE_KINDS.filter((kind) => kinds.has(kind)),
        lines: file.lines,
      };
    })
    .sort((left, right) => left.path.localeCompare(right.path));
}

function roundRobin<T>(groups: readonly T[][], limit: number): T[] {
  const selected: T[] = [];
  for (let round = 0; selected.length < limit; round += 1) {
    let added = false;
    for (const group of groups) {
      const item = group[round];
      if (!item) {
        continue;
      }
      selected.push(item);
      added = true;
      if (selected.length === limit) {
        break;
      }
    }
    if (!added) {
      break;
    }
  }
  return selected;
}

async function currentPromptTarget(inputs: unknown): Promise<{ body: string }> {
  const context = promptContext(inputs);
  return {
    body: await generate(fileSystemPrompt(), buildFilePrompt(context)),
  };
}

async function retiredPromptTarget(inputs: unknown): Promise<{ body: string }> {
  const context = promptContext(inputs);
  return {
    body: await generate(v0SystemPrompt(), buildV0Prompt(context)),
  };
}

async function generate(system: string, user: string): Promise<string> {
  const completion = await withRetry(() =>
    aiClient().chat.completions.create({
      model: aiModel(),
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.2,
      max_tokens: 1_200,
    }),
  );

  const choice = completion.choices[0];
  const text = messageText(choice?.message.content ?? null).trim();
  if (text === "") {
    throw new Error(
      `The model returned an empty explanation (finish reason: ${choice?.finish_reason ?? "unknown"}).`,
    );
  }
  return text;
}

async function specificityEvaluator({
  run,
  example,
}: {
  run: Run;
  example: Example;
}): Promise<EvaluationResult> {
  const body = stringField(run, "outputs", "body");
  const path = stringField(example, "inputs", "path");

  if (body === null || body.trim() === "") {
    // A provider failure is not a low-quality explanation. Throwing leaves
    // the row without a score so it cannot drag the mean down.
    throw new Error("No explanation was produced for this example.");
  }

  const judged = await judgeSpecificity({
    path: path ?? "unknown",
    body,
  });
  return {
    key: "specificity",
    score: judged.score,
    comment: judged.comment,
  };
}

async function runExperiment(
  label: string,
  promptVersion: string,
  target: (inputs: unknown) => Promise<{ body: string }>,
  datasetName: string,
): Promise<ExperimentSummary> {
  const results = await evaluate(target, {
    data: datasetName,
    evaluators: [specificityEvaluator],
    experimentPrefix: `phase11-explain-file-${label}`,
    maxConcurrency: EVALUATION_CONCURRENCY,
    metadata: {
      prompt_version: promptVersion,
      model: aiModel(),
      dataset: datasetName,
      judge: `specificity (${aiModel()})`,
    },
  });

  const scores = new Map<string, number>();
  for (const row of results.results) {
    const result = row.evaluationResults.results.find(
      (entry) => entry.key === "specificity",
    );
    if (result && typeof result.score === "number") {
      scores.set(row.example.id, result.score);
    }
  }

  const mean = average([...scores.values()]);

  console.log(`\n${label} (${promptVersion})`);
  console.log(`  experiment: ${results.experimentName}`);
  console.log(
    `  examples: ${results.results.length}, scored: ${scores.size}, mean specificity: ${mean.toFixed(2)}/5`,
  );

  return {
    label,
    promptVersion,
    experiment: results.experimentName,
    mean,
    scored: scores.size,
    total: results.results.length,
    scores,
  };
}

function report(v1: ExperimentSummary, v0: ExperimentSummary): void {
  console.log("\nComparison");
  console.log(
    `  ${v1.label} (${v1.promptVersion}): ${v1.mean.toFixed(2)}/5 over ${v1.scored}/${v1.total} examples`,
  );
  console.log(
    `  ${v0.label} (${v0.promptVersion}): ${v0.mean.toFixed(2)}/5 over ${v0.scored}/${v0.total} examples`,
  );
  console.log(
    `  Open the dataset in LangSmith to see the two experiments side by side.`,
  );

  const common = [...v1.scores.keys()].filter((id) => v0.scores.has(id));
  if (common.length === 0) {
    console.log("  No examples were scored in both experiments; nothing to compare.");
    return;
  }

  const v1Mean = meanOver(v1.scores, common);
  const v0Mean = meanOver(v0.scores, common);
  console.log(`  Common scored examples: ${common.length}`);
  if (v1.scored !== common.length || v0.scored !== common.length) {
    console.log(
      "  The comparison uses only examples scored in both experiments; provider failures are excluded.",
    );
  }

  const difference = v1Mean - v0Mean;
  if (Math.abs(difference) < 0.005) {
    console.log("  No measurable difference between the two prompts.");
  } else {
    const better = difference > 0 ? v1 : v0;
    const betterMean = difference > 0 ? v1Mean : v0Mean;
    const worseMean = difference > 0 ? v0Mean : v1Mean;
    const magnitude = Math.abs(difference);
    const percent =
      worseMean > 0 ? (magnitude / worseMean) * 100 : null;
    console.log(
      `  ${better.label} is better by ${magnitude.toFixed(2)} points${
        percent === null ? "" : ` (${percent.toFixed(0)}% over ${better.label === "v1" ? "v0" : "v1"})`
      } on ${common.length} common examples.`,
    );
    if (betterMean === 5) {
      console.log(
        `  ${better.label} is at the top of the 5-point scale on every common example; the gap is a lower bound.`,
      );
    }
  }

  console.log(
    `\n  Judge: ${aiModel()}, the same model that wrote the explanations.`,
  );
  console.log(
    "  A model judging specificity is a relative signal, not ground truth.",
  );
}

function meanOver(
  scores: ReadonlyMap<string, number>,
  ids: readonly string[],
): number {
  const values = ids.flatMap((id) => {
    const score = scores.get(id);
    return score === undefined ? [] : [score];
  });
  return average(values);
}

function average(values: readonly number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((total, value) => total + value, 0) / values.length;
}

function promptContext(value: unknown): FilePromptContext {
  const record = recordOf(value, "example inputs");
  return {
    path: requiredString(record, "path"),
    folder: requiredString(record, "folder"),
    lines: requiredNumber(record, "lines"),
    role: nullableString(record.role),
    exports: nullableStringArray(record.exports),
    imports: neighbourList(record.imports),
    importedBy: neighbourList(record.importedBy),
    source: requiredString(record, "source"),
  };
}

function neighbourList(value: unknown): NeighbourPrompt[] {
  if (!Array.isArray(value)) {
    throw new Error("Example inputs have no neighbour list");
  }
  return value.map((entry) => {
    const record = recordOf(entry, "neighbour");
    return {
      path: requiredString(record, "path"),
      role: nullableString(record.role),
      exports: nullableStringArray(record.exports),
      kinds: edgeKinds(record.kinds),
      lines: requiredNumber(record, "lines"),
    };
  });
}

function edgeKinds(value: unknown): EdgeKind[] {
  if (!Array.isArray(value)) {
    throw new Error("A neighbour has no edge kinds");
  }
  const kinds: EdgeKind[] = [];
  for (const entry of value) {
    const kind = EDGE_KINDS.find((known) => known === entry);
    if (!kind) {
      throw new Error(`Unknown edge kind in the dataset: ${String(entry)}`);
    }
    kinds.push(kind);
  }
  return kinds;
}

function stringField(
  value: Run | Example,
  group: "inputs" | "outputs",
  key: string,
): string | null {
  const record = value[group];
  if (record === undefined) {
    return null;
  }
  const field = record[key];
  return typeof field === "string" ? field : null;
}

function requiredString(
  record: Record<string, unknown>,
  key: string,
): string {
  const value = record[key];
  if (typeof value !== "string") {
    throw new Error(`Expected a string for ${key}`);
  }
  return value;
}

function requiredNumber(
  record: Record<string, unknown>,
  key: string,
): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Expected a number for ${key}`);
  }
  return value;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function nullableStringArray(value: unknown): string[] | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    throw new Error("Expected a list of strings");
  }
  return value;
}

function recordOf(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Expected an object for ${what}`);
  }
  return value as Record<string, unknown>;
}

try {
  process.exitCode = await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
