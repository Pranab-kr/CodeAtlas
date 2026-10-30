# CodeAtlas agent

A Managed Deep Agents project. It is a separate service: `mda dev` runs the
langgraph-style Agent Server locally, so threads, streaming and the agent loop
come from the runtime rather than from this repository.

## Run

The Next app owns every fact about the repository. Start it first on port 3000,
then:

```bash
cp env.example .env
# fill LANGSMITH_API_KEY and the model provider values
npm install
npm run dev        # mda dev .
```

`mda dev` prints the server URL (default `http://127.0.0.1:2024`). Put that and
the agent name in the app's `.env.local`:

```bash
AGENT_URL=http://127.0.0.1:2024
AGENT_ASSISTANT_ID=code-atlas-agent
```

The model comes from `AGENT_MODEL` when set, otherwise `openai:$AI_MODEL`.
The `openai:` integration reads `OPENAI_API_KEY` and `OPENAI_BASE_URL`, so the
same OpenAI-compatible provider the app uses can drive the agent.

The versions are pinned rather than floating: Deep Agents 1.16 needs
`@langchain/core` 1.3.2, while MDA 0.10's generated dev package defaults to
1.2.17. The override keeps the runtime and the tools on the same core.

## How a question reaches the data

The app proves the asker can see the analysis, mints a ten-minute credential
naming that analysis and its organization, and sends it in the run's context.
The model never sees the analysis id or the credential. The six tools under
`tools/` forward the credential to the app's `/api/agent/tools`, where the
database verifies it and returns exactly that analysis's stored map. The tools
then run the same graph functions that draw the canvas.

`instructions.md` carries the product rules: look before answering, never name
a path a tool did not return, never infer an edge, and decline questions the
graph cannot answer.

## Checks

```bash
npm run typecheck
```
