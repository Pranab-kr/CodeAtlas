export interface SseFrame {
  event: string;
  data: string;
  id: string | null;
}

/**
 * Reads a server-sent-event body. The agent runtime speaks SSE; this is the
 * only part of the relay that touches the wire format, and the eval reads the
 * same function.
 */
export async function* parseSse(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<SseFrame> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer = (buffer + decoder.decode(value, { stream: true })).replace(
        /\r\n/g,
        "\n",
      );

      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const frame = parseFrame(block);
        if (frame !== null) {
          yield frame;
        }
        boundary = buffer.indexOf("\n\n");
      }
    }

    buffer = (buffer + decoder.decode()).replace(/\r\n/g, "\n");
    const frame = parseFrame(buffer);
    if (frame !== null) {
      yield frame;
    }
  } finally {
    reader.releaseLock();
  }
}

function parseFrame(block: string): SseFrame | null {
  const data: string[] = [];
  let event = "message";
  let id: string | null = null;

  for (const line of block.split("\n")) {
    if (line === "" || line.startsWith(":")) {
      continue;
    }

    const colon = line.indexOf(":");
    const field = colon < 0 ? line : line.slice(0, colon);
    let value = colon < 0 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) {
      value = value.slice(1);
    }

    if (field === "event") {
      event = value === "" ? "message" : value;
    } else if (field === "data") {
      data.push(value);
    } else if (field === "id") {
      id = value;
    }
  }

  if (data.length === 0 && event === "message" && id === null) {
    return null;
  }

  return { event, data: data.join("\n"), id };
}
