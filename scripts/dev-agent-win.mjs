import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const agentDir = process.cwd();
const devDir = path.join(agentDir, ".mda", "dev");
const langgraphConfig = path.join(devDir, "langgraph.json");

// Step 1: Let `mda dev` compile the agent sources and install managed deps
// into `.mda/dev`. On Windows, mda.exe fails only at the final step when it
// spawns `npx` without `.cmd`; ignore that specific exit if `.mda/dev` built.
const compile = spawnSync("mda", ["dev", ".", "--hostname", "127.0.0.1"], {
  cwd: agentDir,
  shell: true,
  stdio: "inherit",
});

if (!existsSync(langgraphConfig)) {
  console.error(
    "\nFailed to compile agent into .mda/dev (langgraph.json not found).",
  );
  process.exit(compile.status ?? 1);
}

// Step 2: Launch the LangGraph dev server through the shell so Windows
// resolves `npx.cmd` / `npx.ps1` cleanly.
console.log("\nStarting LangGraph dev server from .mda/dev ...");
const server = spawn(
  "npx",
  ["--yes", "@langchain/langgraph-cli@^1.5.1", "dev", "--host", "127.0.0.1"],
  {
    cwd: devDir,
    shell: true,
    stdio: "inherit",
  },
);

server.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
