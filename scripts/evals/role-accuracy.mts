import { loadMap } from "../../lib/analysis/load.ts";
import {
  AI_ROLES,
  classifyRoles,
  isAiRole,
  type AiRole,
  type RoleCandidate,
} from "../../lib/ai/roles.ts";
import { fetchFileAt } from "../../lib/ai/source.ts";
import { aiModel } from "../../lib/ai/client.ts";
import { env } from "../../lib/env.ts";
import {
  evalDb,
  mapLimit,
  messageOf,
  readAnalysisTargets,
  type AnalysisTarget,
} from "./shared.mts";

const TARGET_COUNT = 30;
const MINIMUM = 30;
const SOURCE_CONCURRENCY = 5;

interface HeldOut {
  fileId: string;
  analysisId: string;
  role: AiRole;
}

interface FileRow {
  id: string;
  analysis_id: string;
  path: string;
  exports: string[] | null;
  content_hash: string;
}

interface Compared {
  path: string;
  expected: AiRole;
  predicted: AiRole | null;
}

async function main(): Promise<number> {
  if (!env.aiConfigured) {
    throw new Error(
      "AI is not configured. Set AI_BASE_URL, AI_API_KEY and AI_MODEL in .env.local.",
    );
  }

  console.log(`Model: ${aiModel()}`);

  const db = evalDb();
  const heldOut = await readHeldOut(db);
  const selected = sample(heldOut);
  const targets = await readAnalysisTargets(db);
  const targetById = new Map(
    targets.map((target) => [target.id, target]),
  );

  const ids = selected.map((entry) => entry.fileId);
  const { data: files, error } = await db
    .from("files")
    .select("id, analysis_id, path, exports, content_hash")
    .in("id", ids);

  if (error) {
    throw new Error(`Reading held-out files failed: ${error.message}`);
  }

  const fileById = new Map<string, FileRow>(
    files.map((file) => [file.id, file]),
  );
  const work: { file: FileRow; target: AnalysisTarget; role: AiRole }[] = [];

  let missing = 0;
  for (const entry of selected) {
    const file = fileById.get(entry.fileId);
    const target = targetById.get(entry.analysisId);
    if (!file || !target) {
      missing += 1;
      continue;
    }
    work.push({ file, target, role: entry.role });
  }

  console.log(
    `Held-out files: ${selected.length} selected` +
      (missing > 0 ? `, ${missing} missing a file or commit` : ""),
  );

  const analysisIds = [...new Set(work.map((entry) => entry.target.id))];
  const maps = new Map<string, Awaited<ReturnType<typeof loadMap>>>();
  for (const id of analysisIds) {
    maps.set(id, await loadMap(db, id));
  }

  let unreadable = 0;
  let done = 0;
  const loaded = await mapLimit(work, SOURCE_CONCURRENCY, async (entry) => {
    try {
      const fetched = await fetchFileAt(
        entry.target.repository,
        entry.target.commitSha,
        entry.file.path,
      );
      if (fetched.hash !== entry.file.content_hash) {
        unreadable += 1;
        return null;
      }

      const map = maps.get(entry.target.id);
      const imports = (map?.edges ?? [])
        .filter((edge) => edge.source === entry.file.path)
        .map((edge) => edge.target);

      const candidate: RoleCandidate = {
        path: entry.file.path,
        exports: entry.file.exports,
        imports,
        source: fetched.source,
      };
      return { candidate, role: entry.role };
    } catch (error) {
      unreadable += 1;
      console.error(
        `Skipping ${entry.file.path}: ${messageOf(error)}`,
      );
      return null;
    } finally {
      done += 1;
      if (done % 10 === 0 || done === work.length) {
        console.log(`Read ${done}/${work.length} source files`);
      }
    }
  });

  const usable = loaded.filter(
    (entry): entry is NonNullable<typeof entry> => entry !== null,
  );
  if (usable.length < MINIMUM) {
    throw new Error(
      `Only ${usable.length} held-out files could be read; the dataset needs at least ${MINIMUM}.`,
    );
  }

  console.log(
    `\nDataset: ${usable.length} files whose conventional role is one the classifier may return` +
      (unreadable > 0 ? ` (${unreadable} skipped)` : "") +
      ".",
  );

  const predictions = await classifyRoles({
    candidates: usable.map((entry) => entry.candidate),
    onBatch: async (classified, total) => {
      console.log(`Classified ${classified}/${total} files`);
    },
  });

  if (predictions.size === 0) {
    throw new Error(
      "The classifier returned no roles. Check the model configuration and the LangSmith trace.",
    );
  }

  const compared: Compared[] = usable.map((entry) => ({
    path: entry.candidate.path,
    expected: entry.role,
    predicted: predictions.get(entry.candidate.path) ?? null,
  }));
  const correct = compared.filter(
    (entry) => entry.predicted === entry.expected,
  ).length;
  const accuracy = (correct / compared.length) * 100;

  console.log(
    `\nRole accuracy: ${correct}/${compared.length} (${accuracy.toFixed(1)}%)`,
  );

  const byRole = new Map<AiRole, { correct: number; total: number }>();
  for (const entry of compared) {
    const counts = byRole.get(entry.expected) ?? { correct: 0, total: 0 };
    counts.total += 1;
    if (entry.predicted === entry.expected) {
      counts.correct += 1;
    }
    byRole.set(entry.expected, counts);
  }

  console.log("\nBy conventional role:");
  for (const role of AI_ROLES) {
    const counts = byRole.get(role);
    if (counts) {
      console.log(`  ${role}: ${counts.correct}/${counts.total}`);
    }
  }

  const mistakes = compared.filter(
    (entry) => entry.predicted !== entry.expected,
  );
  if (mistakes.length > 0) {
    console.log(`\nMismatches (${mistakes.length}):`);
    for (const entry of mistakes) {
      console.log(
        `  ${entry.path}: expected ${entry.expected}, got ${entry.predicted ?? "no answer"}`,
      );
    }
  }

  return 0;
}

async function readHeldOut(
  db: ReturnType<typeof evalDb>,
): Promise<HeldOut[]> {
  const { data, error } = await db
    .from("file_roles")
    .select("file_id, analysis_id, role")
    .eq("source", "adapter")
    .in("role", [...AI_ROLES])
    .order("analysis_id")
    .order("file_id")
    .limit(1000);

  if (error) {
    throw new Error(`Reading held-out roles failed: ${error.message}`);
  }

  const rows: HeldOut[] = [];
  for (const row of data) {
    if (!isAiRole(row.role)) {
      continue;
    }
    rows.push({
      fileId: row.file_id,
      analysisId: row.analysis_id,
      role: row.role,
    });
  }

  if (rows.length < MINIMUM) {
    throw new Error(
      `Only ${rows.length} held-out files exist; the dataset needs at least ${MINIMUM}.`,
    );
  }

  return rows;
}

/**
 * Round-robin across roles so a rare role is represented, then fill from the
 * largest group. Deterministic: the same stored rows always give the same
 * sample.
 */
function sample(rows: readonly HeldOut[]): HeldOut[] {
  const byRole = new Map<AiRole, HeldOut[]>();
  for (const row of rows) {
    const group = byRole.get(row.role) ?? [];
    group.push(row);
    byRole.set(row.role, group);
  }

  const selected: HeldOut[] = [];
  for (let round = 0; selected.length < TARGET_COUNT; round += 1) {
    let added = false;
    for (const role of AI_ROLES) {
      const row = byRole.get(role)?.[round];
      if (!row) {
        continue;
      }
      selected.push(row);
      added = true;
      if (selected.length === TARGET_COUNT) {
        break;
      }
    }
    if (!added) {
      break;
    }
  }

  return selected;
}

try {
  process.exitCode = await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
