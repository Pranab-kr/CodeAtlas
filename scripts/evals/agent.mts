import { parseSse } from "../../lib/agent/sse.ts";
import { AgentStreamTranslator } from "../../lib/agent/stream.ts";
import { AGENT_TOOL_NAMES } from "../../lib/agent/tools.ts";
import { evalDb, messageOf } from "./shared.mts";

const DEFAULT_AGENT_URL = "http://127.0.0.1:2024";
const DEFAULT_ASSISTANT_ID = "code-atlas-agent";
const DEFAULT_TIMEOUT_SECONDS = 240;

interface Options {
  analysis: string | null;
  cases: ReadonlySet<string> | null;
  timeoutMs: number;
  help: boolean;
}

interface Case {
  id: string;
  question: string;
}

const CASES: readonly Case[] = [
  { id: "auth", question: "Where is authentication handled?" },
  {
    id: "blast",
    question: "What breaks if I change the most depended-on file?",
  },
  { id: "routes", question: "List the API routes." },
  { id: "decline", question: "Is this code any good?" },
];

const PLUMBING: readonly RegExp[] = [
  /\btools?\b/i,
  /\banalysis credential\b/i,
  /\bsigned credential\b/i,
  /\banalysis[_ ]?id\b/i,
  /\bdatabase\b/i,
  /\bsupabase\b/i,
  /\blangsmith\b/i,
  /\bmanaged deep agents?\b/i,
  /\bdeep agents?\b/i,
  /\bprompt\b/i,
  /\b(?:as an ai|language model)\b/i,
  /\b(?:I can't|I cannot|I don't|I do not) (?:access|see|browse|read)\b/i,
  ...AGENT_TOOL_NAMES.filter(
    (name) =>
      name !== "routes" &&
      name !== "walk",
  ).map((name) => new RegExp(`\\b${name}\\b`, "i")),
];

interface Outcome {
  case: Case;
  tools: { name: string; status: "running" | "success" | "error" }[];
  text: string;
  error: string | null;
}

interface Scored extends Outcome {
  lookedUp: boolean;
  plumbing: boolean;
  answered: boolean;
}

function parseOptions(argv: readonly string[]): Options {
  const options: Options = {
    analysis: null,
    cases: null,
    timeoutMs: DEFAULT_TIMEOUT_SECONDS * 1_000,
    help: false,
  };
  const cases = new Set<string>();

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    switch (argument) {
      case "--":
        break;
      case "--analysis": {
        const next = argv[index + 1];
        if (next === undefined) {
          throw new Error("Missing value for --analysis");
        }
        options.analysis = next;
        index += 1;
        break;
      }
      case "--case": {
        const next = argv[index + 1];
        if (next === undefined) {
          throw new Error("Missing value for --case");
        }
        for (const id of next.split(",")) {
          if (id.trim() !== "") {
            cases.add(id.trim());
          }
        }
        index += 1;
        break;
      }
      case "--timeout": {
        const next = argv[index + 1];
        if (next === undefined) {
          throw new Error("Missing value for --timeout");
        }
        const seconds = Number(next);
        if (!Number.isInteger(seconds) || seconds <= 0) {
          throw new Error("--timeout must be a positive number of seconds");
        }
        options.timeoutMs = seconds * 1_000;
        index += 1;
        break;
      }
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown option: ${argument}`);
    }
  }

  if (cases.size > 0) {
    options.cases = cases;
  }
  return options;
}

const USAGE = `Usage: pnpm eval:agent [options]

Runs a small set of real questions against the local agent server and scores
two things deterministically:

  looked up   the answer had at least one successful Atlas lookup behind it
  plumbing    the answer did not mention tools, credentials or its own setup

The Next app and the agent service must both be running. The agent's .env
must point ATLAS_TOOLS_URL at the app.

Options:
  --analysis <uuid>  Ask about this succeeded analysis (default: newest with files)
  --case <id>        Run only these case ids (comma separated): auth, blast, routes, decline
  --timeout <s>      Seconds to wait for one question (default 240)
  --help             Show this message`;

async function main(): Promise<number> {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
    return 0;
  }

  const agentUrl = (process.env.AGENT_URL?.trim() || DEFAULT_AGENT_URL).replace(
    /\/+$/,
    "",
  );
  const assistantId =
    process.env.AGENT_ASSISTANT_ID?.trim() || DEFAULT_ASSISTANT_ID;

  const db = evalDb();
  const analysisId = options.analysis ?? (await newestAnalysis(db));
  if (analysisId === null) {
    throw new Error(
      "No succeeded analysis with stored files. Run one from the app first.",
    );
  }

  const { data: credential, error: mintError } = await db.rpc(
    "agent_mint_credential_for_service",
    { p_analysis_id: analysisId },
  );

  if (mintError || typeof credential !== "string") {
    throw new Error(
      `Minting an eval credential failed: ${mintError?.message ?? "no credential"}`,
    );
  }

  const cases =
    options.cases === null
      ? CASES
      : CASES.filter((testCase) => options.cases?.has(testCase.id));
  if (cases.length === 0) {
    throw new Error("No case matched --case.");
  }

  console.log(`Agent:    ${agentUrl} (${assistantId})`);
  console.log(`Analysis: ${analysisId}`);
  console.log(`Cases:    ${cases.length}\n`);

  const outcomes: Outcome[] = [];
  for (const testCase of cases) {
    process.stdout.write(`${testCase.id.padEnd(10)} `);
    try {
      const outcome = await runCase(
        agentUrl,
        assistantId,
        analysisId,
        credential,
        testCase,
        options.timeoutMs,
      );
      outcomes.push(outcome);
      console.log("done");
    } catch (error) {
      console.log("failed");
      outcomes.push({
        case: testCase,
        tools: [],
        text: "",
        error: messageOf(error),
      });
    }
  }

  const scored: Scored[] = outcomes.map((outcome) => ({
    ...outcome,
    lookedUp: outcome.tools.some(
      (tool) =>
        tool.status === "success" &&
        (AGENT_TOOL_NAMES as readonly string[]).includes(tool.name),
    ),
    plumbing: PLUMBING.some((pattern) => pattern.test(outcome.text)),
    answered: outcome.text.trim() !== "",
  }));

  console.log(
    "\ncase        lookups  looked up  answered  plumbing  answer",
  );
  for (const entry of scored) {
    const names =
      entry.tools.map((tool) => tool.name).join(", ") || "none";
    console.log(
      `${entry.case.id.padEnd(11)} ${String(entry.tools.length).padEnd(8)} ${
        entry.lookedUp ? "yes" : "NO "
      }        ${entry.answered ? "yes" : "NO "}       ${
        entry.plumbing ? "YES" : "no"
      }       ${answerShape(entry.text)}`,
    );
    if (entry.error !== null) {
      console.log(`  error: ${entry.error}`);
    }
    if (entry.plumbing) {
      console.log(
        `  answer: ${entry.text.replace(/\s+/g, " ").trim()}`,
      );
    }
    console.log(`  tools: ${names}`);
  }

  const lookedUp = scored.filter((entry) => entry.lookedUp).length;
  const answered = scored.filter((entry) => entry.answered).length;
  const clean = scored.filter((entry) => !entry.plumbing).length;
  const percent = (value: number): string =>
    `${Math.round((value / scored.length) * 100)}%`;

  console.log(
    `\nLooked up: ${lookedUp}/${scored.length} (${percent(lookedUp)})`,
  );
  console.log(
    `Answered: ${answered}/${scored.length} (${percent(answered)})`,
  );
  console.log(
    `No plumbing: ${clean}/${scored.length} (${percent(clean)})`,
  );

  return 0;
}

async function newestAnalysis(
  db: ReturnType<typeof evalDb>,
): Promise<string | null> {
  const { data, error } = await db
    .from("analyses")
    .select("id")
    .eq("status", "succeeded")
    .order("updated_at", { ascending: false })
    .limit(10);

  if (error) {
    throw new Error(`Reading analyses failed: ${error.message}`);
  }

  for (const analysis of data ?? []) {
    const { count, error: countError } = await db
      .from("files")
      .select("id", { count: "exact", head: true })
      .eq("analysis_id", analysis.id);

    if (countError) {
      throw new Error(`Counting files failed: ${countError.message}`);
    }
    if ((count ?? 0) > 0) {
      return analysis.id;
    }
  }

  return null;
}

async function runCase(
  agentUrl: string,
  assistantId: string,
  analysisId: string,
  credential: string,
  testCase: Case,
  timeoutMs: number,
): Promise<Outcome> {
  const headers = agentHeaders();
  const created = await fetch(`${agentUrl}/threads`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      metadata: { analysis_id: analysisId, purpose: "eval" },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!created.ok) {
    throw new Error(
      `Creating a thread failed (${created.status}): ${(await created.text()).slice(0, 300)}`,
    );
  }

  const thread: unknown = await created.json();
  if (
    typeof thread !== "object" ||
    thread === null ||
    !("thread_id" in thread) ||
    typeof thread.thread_id !== "string"
  ) {
    throw new Error("The agent returned no thread id.");
  }

  const response = await fetch(
    `${agentUrl}/threads/${thread.thread_id}/runs/stream`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        assistant_id: assistantId,
        input: { messages: [{ role: "user", content: testCase.question }] },
        context: { credential },
        stream_mode: "updates",
      }),
      signal: AbortSignal.timeout(timeoutMs),
    },
  );

  if (!response.ok) {
    throw new Error(
      `The run failed (${response.status}): ${(await response.text()).slice(0, 300)}`,
    );
  }
  if (response.body === null) {
    throw new Error("The run returned no stream.");
  }

  const translator = new AgentStreamTranslator();
  const tools = new Map<
    string,
    { name: string; status: "running" | "success" | "error" }
  >();
  let text = "";
  let error: string | null = null;

  for await (const frame of parseSse(response.body)) {
    if (frame.data === "") {
      continue;
    }

    let data: unknown;
    try {
      data = JSON.parse(frame.data);
    } catch {
      data = frame.data;
    }

    for (const event of translator.translate(frame.event, data)) {
      if (event.type === "tool_start") {
        tools.set(event.id, { name: event.name, status: "running" });
      } else if (event.type === "tool_end") {
        const known = tools.get(event.id);
        tools.set(event.id, {
          name: event.name ?? known?.name ?? "unknown_tool",
          status: event.status,
        });
      } else if (event.type === "text") {
        text += event.text;
      } else if (event.type === "error") {
        error = event.message;
      }
    }
  }

  for (const event of translator.finish()) {
    if (event.type === "text") {
      text += event.text;
    }
  }

  return {
    case: testCase,
    tools: [...tools.values()],
    text,
    error,
  };
}

function agentHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const apiKey = process.env.AGENT_API_KEY?.trim();
  if (apiKey) {
    headers["x-api-key"] = apiKey;
  }
  return headers;
}

// A one-line shape of the answer, so the terminal table stays readable.
function answerShape(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean === "") {
    return "(no answer)";
  }
  return clean.length > 60 ? `${clean.slice(0, 57)}...` : clean;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(messageOf(error));
    process.exitCode = 1;
  });
