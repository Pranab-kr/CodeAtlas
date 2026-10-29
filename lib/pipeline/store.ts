import type { SupabaseClient } from "@supabase/supabase-js";

import type { ParseResult } from "@/lib/parser/types";
import type { Database, Json } from "@/lib/supabase/database.types";

type Db = SupabaseClient<Database>;

// Each request stays well inside PostgREST's statement timeout. Chunks aren't
// one transaction, but nothing reads as complete until the final update, and
// a failure part-way marks the run failed.
const FILE_CHUNK = 1000;
const EDGE_CHUNK = 2000;

export async function storeResult(
  db: Db,
  analysis: { id: string; organizationId: string },
  result: ParseResult,
): Promise<void> {
  // A re-run replaces what the last run stored; edges go with their files.
  const cleared = await db
    .from("files")
    .delete()
    .eq("analysis_id", analysis.id);
  if (cleared.error) {
    throw new Error(
      `Clearing the previous run's files failed: ${cleared.error.message}`,
    );
  }

  const files: Database["public"]["Tables"]["files"]["Insert"][] =
    result.files.map((file) => ({
      organization_id: analysis.organizationId,
      analysis_id: analysis.id,
      path: file.path,
      folder: file.folder,
      lines: file.lines,
      content_hash: file.contentHash,
      exports: file.exports,
    }));

  for (let index = 0; index < files.length; index += FILE_CHUNK) {
    const { error } = await db
      .from("files")
      .insert(files.slice(index, index + FILE_CHUNK));
    if (error) {
      throw new Error(`Storing files failed: ${error.message}`);
    }
  }

  // Roles arrive keyed by path, like routes: the database joins them to the
  // files this run just stored and refuses the whole chunk if one misses.
  const roles: Json[] = [];
  for (const file of result.files) {
    if (file.role !== null) {
      roles.push({ path: file.path, role: file.role });
    }
  }

  for (let index = 0; index < roles.length; index += FILE_CHUNK) {
    const { error } = await db.rpc("insert_file_roles", {
      p_analysis_id: analysis.id,
      p_roles: roles.slice(index, index + FILE_CHUNK),
    });
    if (error) {
      throw new Error(`Storing file roles failed: ${error.message}`);
    }
  }

  const routes: Json[] = result.routes.map(
    (route): Json => ({
      file: route.path,
      method: route.method,
      pattern: route.pattern,
      line: route.line,
    }),
  );

  for (let index = 0; index < routes.length; index += FILE_CHUNK) {
    const { error } = await db.rpc("insert_routes", {
      p_analysis_id: analysis.id,
      p_routes: routes.slice(index, index + FILE_CHUNK),
    });
    if (error) {
      throw new Error(`Storing routes failed: ${error.message}`);
    }
  }

  // Ends are matched to stored files by path in the database, which refuses
  // the whole chunk if any edge doesn't match.
  const edges: Json[] = result.edges.map(
    (edge): Json => ({
      source: edge.source,
      target: edge.target,
      kind: edge.kind,
      specifier: edge.specifier,
      line: edge.line,
    }),
  );

  for (let index = 0; index < edges.length; index += EDGE_CHUNK) {
    const { error } = await db.rpc("insert_edges", {
      p_analysis_id: analysis.id,
      p_edges: edges.slice(index, index + EDGE_CHUNK),
    });
    if (error) {
      throw new Error(`Storing edges failed: ${error.message}`);
    }
  }
}
