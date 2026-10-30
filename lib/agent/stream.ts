/**
 * The narrow event vocabulary the Ask panel understands. The runtime's stream
 * is wider than this; everything not needed to show a lookup or a sentence is
 * dropped here.
 */
export type AskEvent =
  | { type: "thread"; threadId: string }
  | { type: "text"; text: string }
  | { type: "tool_start"; id: string; name: string; arguments: unknown }
  | {
      type: "tool_end";
      id: string;
      name: string | null;
      content: string;
      status: "success" | "error";
    }
  | { type: "error"; message: string }
  | { type: "done" };

/**
 * Turns the runtime's `updates` frames into tool calls and the final answer.
 *
 * The token stream cannot be used for the answer: a model emits narration
 * before each tool call, and those sentences are not the answer. The final
 * message in the state has no tool calls, so it is the one shown.
 */
export class AgentStreamTranslator {
  private readonly toolNames = new Map<string, string>();
  private readonly started = new Set<string>();
  private answer: string | null = null;

  translate(event: string, data: unknown): AskEvent[] {
    if (event === "updates") {
      return this.fromUpdates(data);
    }
    if (event === "error") {
      return [{ type: "error", message: errorText(data) }];
    }
    if (event === "end") {
      return this.finish();
    }
    return [];
  }

  /** Called at end of stream when the runtime never sent its own end frame. */
  finish(): AskEvent[] {
    const events: AskEvent[] = [];

    if (this.answer !== null && this.answer.trim() !== "") {
      events.push({ type: "text", text: this.answer });
      this.answer = null;
    }
    events.push({ type: "done" });
    return events;
  }

  private fromUpdates(data: unknown): AskEvent[] {
    const events: AskEvent[] = [];

    for (const message of messagesIn(data)) {
      const calls = Array.isArray(message.tool_calls)
        ? message.tool_calls
        : [];
      const isAi = typeof message.type === "string" && /ai/i.test(message.type);

      if (isAi && calls.length === 0) {
        const text = textOf(message.content).trim();
        if (text !== "") {
          this.answer = text;
        }
      }

      for (const call of calls) {
        if (!isRecord(call)) {
          continue;
        }
        const name =
          typeof call.name === "string" ? call.name : "unknown_tool";
        const id = toolCallId(call, name);
        this.toolNames.set(id, name);
        if (!this.started.has(id)) {
          this.started.add(id);
          events.push({
            type: "tool_start",
            id,
            name,
            arguments: call.args ?? null,
          });
        }
      }

      if (typeof message.tool_call_id !== "string") {
        continue;
      }

      const id = message.tool_call_id;
      const name =
        typeof message.name === "string"
          ? message.name
          : (this.toolNames.get(id) ?? null);
      if (name !== null) {
        this.toolNames.set(id, name);
      }

      events.push({
        type: "tool_end",
        id,
        name,
        content: textOf(message.content).slice(0, 1_000),
        status: message.status === "error" ? "error" : "success",
      });
    }

    return events;
  }
}

function toolCallId(
  call: Record<string, unknown>,
  name: string,
): string {
  if (typeof call.id === "string" && call.id !== "") {
    return call.id;
  }
  return `${name}:${JSON.stringify(call.args ?? null)}`;
}

/** Every object in an update that is a tool call, tool result or AI message. */
function messagesIn(
  value: unknown,
  into: Record<string, unknown>[] = [],
): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    for (const entry of value) {
      messagesIn(entry, into);
    }
    return into;
  }
  if (!isRecord(value)) {
    return into;
  }

  const hasToolCalls =
    Array.isArray(value.tool_calls) && value.tool_calls.length > 0;
  const isToolResult = typeof value.tool_call_id === "string";
  const isAi =
    typeof value.type === "string" &&
    /ai/i.test(value.type) &&
    (typeof value.content === "string" || Array.isArray(value.content));

  if (hasToolCalls || isToolResult || isAi) {
    into.push(value);
  }

  for (const entry of Object.values(value)) {
    messagesIn(entry, into);
  }
  return into;
}

function textOf(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }

  let text = "";
  for (const block of content) {
    if (typeof block === "string") {
      text += block;
      continue;
    }
    if (!isRecord(block)) {
      continue;
    }
    const type = block.type;
    if (
      typeof block.text === "string" &&
      (type === undefined || type === "text" || type === "text_delta")
    ) {
      text += block.text;
    }
  }
  return text;
}

function errorText(data: unknown): string {
  if (typeof data === "string") {
    if (data.trim() === "") {
      return "The agent stopped with an error.";
    }
    return data;
  }
  if (isRecord(data)) {
    if (typeof data.message === "string" && data.message !== "") {
      return data.message;
    }
    if (typeof data.error === "string" && data.error !== "") {
      return data.error;
    }
  }
  return "The agent stopped with an error.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
