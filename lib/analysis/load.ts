import type { SupabaseClient } from "@supabase/supabase-js";

import { computeFanCounts } from "@/lib/parser/graph";
import type {
  EdgeKind,
  ParsedEdge,
  ParsedFile,
} from "@/lib/parser/types";
import type { Database } from "@/lib/supabase/database.types";

type Db = SupabaseClient<Database>;

export interface StoredMap {
  files: ParsedFile[];
  edges: ParsedEdge[];
}

// Supabase's PostgREST row limit is 1000, so every list is paged.
const PAGE = 1000;

const EDGE_KINDS: readonly EdgeKind[] = [
  "import",
  "reexport",
  "dynamic",
  "require",
];

/**
 * The explorer reads the stored rows. Paths are what the canvas, the folder
 * fold and the parser contract all speak; the ids exist only to join edges.
 */
export async function loadMap(
  db: Db,
  analysisId: string,
): Promise<StoredMap> {
  const fileRows = await readFiles(db, analysisId);
  const edgeRows = await readEdges(db, analysisId);

  const pathById = new Map(fileRows.map((row) => [row.id, row.path]));

  const edges: ParsedEdge[] = edgeRows.map((row) => {
    const source = pathById.get(row.source_file_id);
    const target = pathById.get(row.target_file_id);
    if (source === undefined || target === undefined) {
      // Foreign keys make this impossible for rows this code wrote. If it
      // happens, the map would be missing an edge, so it fails loudly.
      throw new Error(
        `Stored edge ${row.source_file_id} -> ${row.target_file_id} references a file that wasn't read`,
      );
    }
    return {
      source,
      target,
      kind: readKind(row.kind),
      specifier: row.specifier,
      line: row.line,
    };
  });

  const fans = computeFanCounts(fileRows, edges);
  const files: ParsedFile[] = fileRows.map((row) => ({
    path: row.path,
    folder: row.folder,
    lines: row.lines,
    contentHash: row.content_hash,
    // Roles arrive with the adapters in a later phase.
    role: null,
    fanIn: fans.get(row.path)?.fanIn ?? 0,
    fanOut: fans.get(row.path)?.fanOut ?? 0,
  }));

  return { files, edges };
}

async function readFiles(db: Db, analysisId: string) {
  const rows: {
    id: string;
    path: string;
    folder: string;
    lines: number;
    content_hash: string;
  }[] = [];

  for (let from = 0; ; ) {
    const { data, error } = await db
      .from("files")
      .select("id, path, folder, lines, content_hash")
      .eq("analysis_id", analysisId)
      .order("path")
      .range(from, from + PAGE - 1);

    if (error) {
      throw new Error(`Reading the analysis's files failed: ${error.message}`);
    }

    rows.push(...data);
    if (data.length === 0) {
      return rows;
    }
    // The returned length is the stride, so a server-side row cap smaller
    // than PAGE still walks every row.
    from += data.length;
  }
}

async function readEdges(db: Db, analysisId: string) {
  const rows: {
    source_file_id: string;
    target_file_id: string;
    kind: string;
    specifier: string;
    line: number;
  }[] = [];

  for (let from = 0; ; ) {
    const { data, error } = await db
      .from("edges")
      .select("source_file_id, target_file_id, kind, specifier, line")
      .eq("analysis_id", analysisId)
      .order("id")
      .range(from, from + PAGE - 1);

    if (error) {
      throw new Error(`Reading the analysis's edges failed: ${error.message}`);
    }

    rows.push(...data);
    if (data.length === 0) {
      return rows;
    }
    from += data.length;
  }
}

function readKind(value: string): EdgeKind {
  const kind = EDGE_KINDS.find((known) => known === value);
  if (!kind) {
    throw new Error(`Stored edge has an unknown kind: ${value}`);
  }
  return kind;
}
