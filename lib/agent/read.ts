import { createClient } from "@supabase/supabase-js";

import {
  buildStoredMap,
  type StoredEdgeRow,
  type StoredFileRow,
  type StoredMap,
  type StoredRouteRow,
} from "@/lib/analysis/load";
import { readCoverage, type Coverage } from "@/lib/analysis/coverage";
import { env } from "@/lib/env";
import { isRole, type Role } from "@/lib/roles";
import type { Database, Json } from "@/lib/supabase/database.types";

export class AgentCredentialError extends Error {
  override name = "AgentCredentialError";
}

export class AgentReadError extends Error {
  override name = "AgentReadError";
}

export interface AgentAnalysis {
  id: string;
  projectName: string;
  repositoryUrl: string;
  commitSha: string | null;
  framework: string | null;
  coverage: Coverage | null;
}

export interface AgentSource {
  analysis: AgentAnalysis;
  map: StoredMap;
}

/**
 * The only way the agent's tools reach stored rows. The database checks the
 * signed credential and returns one analysis; this client holds the
 * publishable key and no session, so it can read nothing else.
 */
export async function readAgentSource(token: string): Promise<AgentSource> {
  const db = createClient<Database>(
    env.supabaseUrl,
    env.supabasePublishableKey,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data, error } = await db.rpc("agent_read_analysis", {
    p_token: token,
  });

  if (error) {
    if (error.code === "42501" || error.code === "PGRST116") {
      throw new AgentCredentialError(
        "The analysis credential is invalid or has expired.",
      );
    }
    throw new AgentReadError(
      `Reading the analysis failed: ${error.message}`,
    );
  }

  return parseSource(data);
}

function parseSource(value: Json | null): AgentSource {
  if (value === null) {
    throw new AgentReadError("The database returned no analysis.");
  }

  const root = record(value, "analysis document");
  const analysis = record(root.analysis, "analysis");
  const project = record(root.project, "project");

  const coverageValue = analysis.coverage;
  const coverage =
    coverageValue === undefined || coverageValue === null
      ? null
      : readCoverage(coverageValue);

  const files = list(root.files, "files").map((entry) => {
    const row = record(entry, "file");
    return {
      id: text(row.id, "file.id"),
      path: text(row.path, "file.path"),
      folder: text(row.folder, "file.folder"),
      lines: integer(row.lines, "file.lines"),
      content_hash: text(row.content_hash, "file.content_hash"),
      exports: nullableTextList(row.exports, "file.exports"),
    } satisfies StoredFileRow;
  });

  const edges = list(root.edges, "edges").map((entry) => {
    const row = record(entry, "edge");
    return {
      source_file_id: text(row.source_file_id, "edge.source_file_id"),
      target_file_id: text(row.target_file_id, "edge.target_file_id"),
      kind: text(row.kind, "edge.kind"),
      specifier: text(row.specifier, "edge.specifier"),
      line: integer(row.line, "edge.line"),
    } satisfies StoredEdgeRow;
  });

  const routes = list(root.routes, "routes").map((entry) => {
    const row = record(entry, "route");
    return {
      file_id: text(row.file_id, "route.file_id"),
      method: text(row.method, "route.method"),
      path: text(row.path, "route.path"),
      line: integer(row.line, "route.line"),
    } satisfies StoredRouteRow;
  });

  const roles = new Map<string, Role>();
  for (const entry of list(root.roles, "roles")) {
    const row = record(entry, "role");
    const fileId = text(row.file_id, "role.file_id");
    const role = text(row.role, "role.role");
    if (!isRole(role)) {
      throw new AgentReadError(`Stored file role is not in the taxonomy: ${role}`);
    }
    roles.set(fileId, role);
  }

  return {
    analysis: {
      id: text(analysis.id, "analysis.id"),
      projectName: text(project.name, "project.name"),
      repositoryUrl: text(project.repository_url, "project.repository_url"),
      commitSha: nullableText(analysis.commit_sha, "analysis.commit_sha"),
      framework: nullableText(analysis.framework, "analysis.framework"),
      coverage,
    },
    map: buildStoredMap(files, roles, edges, routes),
  };
}

function record(
  value: Json | undefined,
  name: string,
): { [key: string]: Json | undefined } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new AgentReadError(`The ${name} in the analysis is not an object.`);
  }
  return value;
}

function list(value: Json | undefined, name: string): Json[] {
  if (!Array.isArray(value)) {
    throw new AgentReadError(`The ${name} in the analysis is not a list.`);
  }
  return value;
}

function text(value: Json | undefined, name: string): string {
  if (typeof value !== "string") {
    throw new AgentReadError(`The ${name} in the analysis is not text.`);
  }
  return value;
}

function nullableText(value: Json | undefined, name: string): string | null {
  if (value === null) {
    return null;
  }
  return text(value, name);
}

function integer(value: Json | undefined, name: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new AgentReadError(`The ${name} in the analysis is not an integer.`);
  }
  return value;
}

function nullableTextList(
  value: Json | undefined,
  name: string,
): string[] | null {
  if (value === null) {
    return null;
  }
  if (!Array.isArray(value)) {
    throw new AgentReadError(`The ${name} in the analysis is not a list.`);
  }
  return value.map((entry) => text(entry, `${name} entry`));
}
