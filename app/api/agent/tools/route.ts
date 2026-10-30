import { NextResponse } from "next/server";

import {
  AgentCredentialError,
  AgentReadError,
  readAgentSource,
} from "@/lib/agent/read";
import {
  AgentToolError,
  parseAgentToolRequest,
  runAgentTool,
} from "@/lib/agent/tools";

const MAX_BODY = 16_384;

/**
 * The agent's read-only surface. It has no signed-in user: the bearer token is
 * the database-signed credential naming one analysis and its organization.
 * The publishable key behind it can read nothing on its own.
 */
export async function POST(request: Request): Promise<Response> {
  const token = bearer(request.headers.get("authorization"));
  if (token === null) {
    return fail("A bearer credential is required.", 401);
  }

  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY) {
    return fail("The tool request is too large.", 413);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("The tool request is not JSON.", 400);
  }

  try {
    const parsed = parseAgentToolRequest(body);
    const source = await readAgentSource(token);
    return NextResponse.json(runAgentTool(source, parsed), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof AgentToolError) {
      return fail(error.message, error.status);
    }
    if (error instanceof AgentCredentialError) {
      return fail(error.message, 401);
    }
    if (error instanceof AgentReadError) {
      console.error("Agent tool read failed:", error.message);
      return fail("The analysis could not be read.", 502);
    }
    console.error("Agent tool failed:", error);
    return fail("The tool failed.", 500);
  }
}

function bearer(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  const match = /^Bearer\s+(\S+)$/i.exec(value);
  return match?.[1] ?? null;
}

function fail(message: string, status: number): Response {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
