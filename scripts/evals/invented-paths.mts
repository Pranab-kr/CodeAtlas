import { readFileSync } from "node:fs";

import { Client } from "langsmith";

import { inventedPaths } from "../../lib/ai/invented-paths.ts";

const PROJECT = process.env.LANGSMITH_PROJECT?.trim() || "code-atlas";
const DAY_MS = 24 * 60 * 60 * 1000;

interface Options {
  limit: number;
  trace: string | null;
  body: string | null;
  allowed: string | null;
  selfTest: boolean;
  help: boolean;
}

interface Scored {
  runId: string;
  name: string;
  target: string;
  failures: string[];
}

function parseOptions(argv: readonly string[]): Options {
  const options: Options = {
    limit: 50,
    trace: null,
    body: null,
    allowed: null,
    selfTest: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = () => {
      const next = argv[index + 1];
      if (next === undefined) {
        throw new Error(`Missing value for ${argument}`);
      }
      index += 1;
      return next;
    };

    switch (argument) {
      case "--":
        break;
      case "--limit":
        options.limit = positiveInteger(value(), "--limit");
        break;
      case "--trace":
        options.trace = value();
        break;
      case "--body":
        options.body = value();
        break;
      case "--allowed":
        options.allowed = value();
        break;
      case "--self-test":
        options.selfTest = true;
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

function positiveInteger(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

const USAGE = `Usage: pnpm eval:paths [options]

Scores path-shaped tokens in recent real explanations against the exact set of
paths each prompt was shown. A token absent from that set is reported.

Options:
  --limit <n>       How many recent explanations to score (default 50)
  --trace <id>      Score one stored explanation against a trace's context
  --body <file>     With --trace or --allowed, score this explanation instead
  --allowed <file>  With --body, read allowed paths from a file (one per line)
  --self-test       Run the deterministic rules against known cases
  --help            Show this message

Examples:
  pnpm eval:paths
  pnpm eval:paths -- --trace <run-id> --body /tmp/edited-explanation.txt
  pnpm eval:paths -- --body /tmp/edited.txt --allowed /tmp/allowed.txt
  pnpm eval:paths -- --self-test`;

async function main(): Promise<number> {
  const options = parseOptions(process.argv.slice(2));

  if (options.help) {
    console.log(USAGE);
    return 0;
  }
  if (options.selfTest) {
    return selfTest();
  }

  if (options.trace !== null || options.allowed !== null) {
    if (options.body === null) {
      throw new Error("--trace and --allowed need --body");
    }
    return scoreOne(options);
  }

  if (options.body !== null) {
    throw new Error("--body needs --trace or --allowed");
  }

  return scoreRecent(options.limit);
}

async function scoreRecent(limit: number): Promise<number> {
  const client = new Client();
  const projectInfo = await readProject(client);
  const since = new Date(Date.now() - 30 * DAY_MS).toISOString();

  const scored: Scored[] = [];
  let cacheHits = 0;
  let unscored = 0;

  const page = client.runs.query({
    project_ids: [projectInfo.id],
    is_root: true,
    run_type: "CHAIN",
    min_start_time: since,
    page_size: Math.min(100, Math.max(20, limit * 2)),
    selects: [
      "ID",
      "NAME",
      "START_TIME",
      "INPUTS",
      "OUTPUTS",
      "EXTRA",
      "TAGS",
      "TRACE_ID",
    ],
  });

  for await (const run of page) {
    if (run.name !== "explain-file" && run.name !== "explain-folder") {
      continue;
    }
    // A cache hit repeats a body that was already scored when it was written.
    if (run.outputs?.cached === true) {
      cacheHits += 1;
      continue;
    }

    const allowed = allowedPathsOf(run.extra);
    const body = textOf(run.outputs?.body);
    if (allowed === null || body === null) {
      unscored += 1;
      continue;
    }

    scored.push({
      runId: run.id ?? "unknown",
      name: run.name,
      target: targetOf(run.inputs),
      failures: inventedPaths(body, allowed),
    });

    if (scored.length >= limit) {
      break;
    }
  }

  if (scored.length === 0) {
    console.log(
      `No scored explanations in the last 30 days (${unscored} run${
        unscored === 1 ? "" : "s"
      } without a recorded path set, ${cacheHits} cache hit${
        cacheHits === 1 ? "" : "s"
      }).`,
    );
    console.log(
      "Generate one explanation in the app, then run this again. A cached answer is not re-scored.",
    );
    return 0;
  }

  const flagged = scored.filter((entry) => entry.failures.length > 0);
  const clean = scored.length - flagged.length;
  const percentage = (clean / scored.length) * 100;

  console.log(
    `Scored ${scored.length} explanation${scored.length === 1 ? "" : "s"}` +
      (unscored > 0
        ? `, skipped ${unscored} without a recorded path set`
        : "") +
      (cacheHits > 0 ? `, skipped ${cacheHits} cache hit${cacheHits === 1 ? "" : "s"}` : "") +
      ".",
  );
  console.log(
    `Clean: ${clean}/${scored.length} (${percentage.toFixed(1)}%)`,
  );

  if (flagged.length > 0) {
    console.log(`\nFlagged (${flagged.length}):`);
    for (const entry of flagged) {
      console.log(
        `- ${entry.runId} ${entry.name} ${entry.target}\n  ${entry.failures.join(", ")}`,
      );
    }
  }

  return 0;
}

async function scoreOne(options: Options): Promise<number> {
  if (options.body === null) {
    throw new Error("--body is required");
  }
  const body = readFileSync(options.body, "utf8");

  let allowed: string[];
  let target = "custom explanation";

  if (options.allowed !== null) {
    allowed = readFileSync(options.allowed, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line !== "");
  } else {
    if (options.trace === null) {
      throw new Error("--body needs --trace or --allowed");
    }
    const client = new Client();
    const projectInfo = await readProject(client);
    const run = await client.runs.retrieve(options.trace, {
      project_id: projectInfo.id,
      selects: [
        "ID",
        "NAME",
        "START_TIME",
        "INPUTS",
        "OUTPUTS",
        "EXTRA",
        "TAGS",
        "TRACE_ID",
      ],
    });

    const recorded = allowedPathsOf(run.extra);
    if (recorded === null) {
      throw new Error(
        "That trace has no recorded allowed paths. It predates the phase 11 evaluator; generate a new explanation.",
      );
    }
    allowed = recorded;
    target = targetOf(run.inputs);
  }

  const failures = inventedPaths(body, allowed);

  console.log(`Target: ${target}`);
  console.log(`Allowed paths: ${allowed.length}`);
  if (failures.length === 0) {
    console.log("Clean: every path-shaped token was in the context.");
    return 0;
  }

  console.log(`Invented (${failures.length}): ${failures.join(", ")}`);
  return 1;
}

function selfTest(): number {
  const allowed = ["src/lib/db.ts", "src/app/page.tsx", "src"];

  const cases: { name: string; body: string; expected: string[] }[] = [
    {
      name: "known paths pass",
      body: "It imports `src/lib/db.ts`; `src/app/page.tsx` renders it.",
      expected: [],
    },
    {
      name: "a made-up filename is caught",
      body: "It imports `src/ghost.ts`.",
      expected: ["src/ghost.ts"],
    },
    {
      name: "a bare made-up filename is caught",
      body: "The helper lives in ghost.ts.",
      expected: ["ghost.ts"],
    },
    {
      name: "a capitalized made-up filename is caught",
      body: "The component lives in Ghost.tsx.",
      expected: ["Ghost.tsx"],
    },
    {
      name: "an absolute made-up filename is caught",
      body: "See /src/ghost.ts.",
      expected: ["/src/ghost.ts"],
    },
    {
      name: "a route is not a repository path",
      body: "The route /api/users is listed.",
      expected: [],
    },
    {
      name: "prose slashes and technology names are not paths",
      body: "It handles and/or cases, e.g. Node.js, TCP/IP/UDP and 2026/10/30.",
      expected: [],
    },
    {
      name: "sentence punctuation is trimmed",
      body: "The folder is src.",
      expected: [],
    },
  ];

  let failed = 0;
  for (const test of cases) {
    const actual = inventedPaths(test.body, allowed);
    const pass =
      actual.length === test.expected.length &&
      actual.every((token, index) => token === test.expected[index]);
    console.log(`${pass ? "PASS" : "FAIL"} ${test.name}`);
    if (!pass) {
      failed += 1;
      console.log(`  expected: ${JSON.stringify(test.expected)}`);
      console.log(`  actual:   ${JSON.stringify(actual)}`);
    }
  }

  console.log(failed === 0 ? "\nAll checks passed." : `\n${failed} failed.`);
  return failed === 0 ? 0 : 1;
}

async function readProject(client: Client) {
  return client.readProject({ projectName: PROJECT });
}

function allowedPathsOf(extra: unknown): string[] | null {
  if (!isRecord(extra)) {
    return null;
  }
  const metadata = extra.metadata;
  if (!isRecord(metadata)) {
    return null;
  }
  const allowed = metadata.allowed_paths;
  if (
    !Array.isArray(allowed) ||
    !allowed.every((value) => typeof value === "string")
  ) {
    return null;
  }
  return allowed;
}

function targetOf(inputs: unknown): string {
  if (!isRecord(inputs)) {
    return "unknown";
  }
  const path = inputs.path;
  if (typeof path === "string") {
    return path;
  }
  const folder = inputs.folder;
  return typeof folder === "string" ? folder : "unknown";
}

function textOf(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

try {
  process.exitCode = await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
