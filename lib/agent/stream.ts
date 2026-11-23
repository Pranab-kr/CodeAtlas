/**
 * The narrow event vocabulary the Ask panel understands. Everything not needed
 * to show a lookup or a final answer is dropped before it crosses the wire.
 */
export type AskEvent =
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
