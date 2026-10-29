import { createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadMap } from "@/lib/analysis/load";
import { foldModules } from "@/lib/graph/fold";
import type { EdgeKind } from "@/lib/parser/types";
import { isRole, type Role } from "@/lib/roles";
import type { Database } from "@/lib/supabase/database.types";

import type {
  FolderBoundaryPrompt,
  FolderFilePrompt,
  FolderPromptContext,
  NeighbourPrompt,
} from "./prompts";

type Db = SupabaseClient<Database>;

const PAGE = 1000;
const ID_CHUNK = 200;

const EDGE_KINDS: readonly EdgeKind[] = [
  "import",
  "reexport",
  "dynamic",
  "require",
];

export interface FileContext {
  id: string;
  path: string;
  folder: string;
  lines: number;
  contentHash: string;
  role: Role | null;
  exports: string[] | null;
  imports: NeighbourPrompt[];
  importedBy: NeighbourPrompt[];
}

export interface FolderContext extends FolderPromptContext {
  contentHash: string;
}

interface FileRow {
  id: string;
  path: string;
  folder: string;
  lines: number;
  content_hash: string;
  exports: string[] | null;
}

interface EdgeRow {
  id: string;
  source_file_id: string;
  target_file_id: string;
  kind: string;
  line: number;
}

/**
 * Everything the file prompt may see: the target and the complete set of
 * files connected to it in either direction. Nothing else is read, so no
 * path can reach the model that the parser did not put in an edge.
 */
export async function loadFileContext(
  db: Db,
  analysisId: string,
  path: string,
): Promise<FileContext> {
  const { data: target, error } = await db
    .from("files")
    .select("id, path, folder, lines, content_hash, exports")
    .eq("analysis_id", analysisId)
    .eq("path", path)
    .maybeSingle<FileRow>();

  if (error) {
    throw new Error(`Reading ${path} failed: ${error.message}`);
  }
  if (!target) {
    throw new Error(`This analysis has no file at ${path}.`);
  }

  const edgeRows = await readEdgesForFile(db, analysisId, target.id);
  const neighbourIds = new Set<string>();
  for (const edge of edgeRows) {
    if (edge.source_file_id === target.id) {
      neighbourIds.add(edge.target_file_id);
    }
    if (edge.target_file_id === target.id) {
      neighbourIds.add(edge.source_file_id);
    }
  }

  const fileRows = await readFilesById(db, analysisId, [...neighbourIds]);
  const byId = new Map(fileRows.map((row) => [row.id, row]));
  const roleById = await readRolesById(db, analysisId, [
    target.id,
    ...neighbourIds,
  ]);

  const imports = new Map<string, Set<EdgeKind>>();
  const importedBy = new Map<string, Set<EdgeKind>>();

  for (const edge of edgeRows) {
    const kind = readKind(edge.kind);
    if (edge.source_file_id === target.id) {
      addKind(imports, edge.target_file_id, kind);
    }
    if (edge.target_file_id === target.id) {
      addKind(importedBy, edge.source_file_id, kind);
    }
  }

  return {
    id: target.id,
    path: target.path,
    folder: target.folder,
    lines: target.lines,
    contentHash: target.content_hash,
    role: roleById.get(target.id) ?? null,
    exports: target.exports,
    imports: neighbourRows(imports, byId, roleById),
    importedBy: neighbourRows(importedBy, byId, roleById),
  };
}

/**
 * The folded module, reconstructed from the same files and edges the browser
 * folded. It is the folder the pane selected, including any thin directories
 * that merged into it, not everything under its path.
 */
export async function loadFolderContext(
  db: Db,
  analysisId: string,
  folderId: string,
  rootLabel: string,
): Promise<FolderContext> {
  const map = await loadMap(db, analysisId);
  const fold = foldModules(map.files, map.edges, { rootLabel });
  const folded = fold.modules.find((entry) => entry.id === folderId);

  if (!folded) {
    throw new Error("That folder is not part of this map.");
  }

  const byPath = new Map(map.files.map((file) => [file.path, file]));
  const inside = new Set(folded.files.map((file) => file.path));

  const foldedFiles = folded.files.map((entry) => {
    const file = byPath.get(entry.path);
    if (!file) {
      throw new Error(`Folded file ${entry.path} is missing from the map.`);
    }
    return file;
  });

  const files: FolderFilePrompt[] = foldedFiles.map((file) => ({
    path: file.path,
    role: file.role,
    exports: file.exports,
    lines: file.lines,
  }));

  const inbound: FolderBoundaryPrompt[] = [];
  const outbound: FolderBoundaryPrompt[] = [];

  for (const edge of map.edges) {
    const sourceInside = inside.has(edge.source);
    const targetInside = inside.has(edge.target);

    if (sourceInside === targetInside) {
      continue;
    }
    if (targetInside) {
      inbound.push({
        outside: edge.source,
        inside: edge.target,
        kind: edge.kind,
      });
    } else {
      outbound.push({
        inside: edge.source,
        outside: edge.target,
        kind: edge.kind,
      });
    }
  }

  inbound.sort(compareBoundary);
  outbound.sort(compareBoundary);

  return {
    id: folded.id,
    label: folded.label,
    files,
    fanIn: folded.fanIn,
    fanOut: folded.fanOut,
    inbound,
    outbound,
    contentHash: folderContentHash(folded.id, foldedFiles, map.edges),
  };
}

/**
 * The key a folder explanation is cached under. It covers what the prompt is
 * made from: every file's content and role inside the folder, plus every edge
 * crossing its boundary.
 */
function folderContentHash(
  id: string,
  files: readonly {
    path: string;
    contentHash: string;
    role: Role | null;
    exports: string[] | null;
    lines: number;
  }[],
  edges: readonly {
    source: string;
    target: string;
    kind: EdgeKind;
  }[],
): string {
  const inside = new Set(files.map((file) => file.path));
  const entries = files
    .map((file) => ({
      path: file.path,
      contentHash: file.contentHash,
      role: file.role,
      exports: file.exports,
      lines: file.lines,
    }))
    .sort((left, right) => left.path.localeCompare(right.path));

  const boundary = edges
    .filter((edge) => inside.has(edge.source) !== inside.has(edge.target))
    .map((edge) => [edge.source, edge.target, edge.kind] as const)
    .sort(
      (left, right) =>
        left[0].localeCompare(right[0]) ||
        left[1].localeCompare(right[1]) ||
        left[2].localeCompare(right[2]),
    );

  return createHash("sha256")
    .update(JSON.stringify({ id, entries, boundary }))
    .digest("hex");
}

async function readEdgesForFile(
  db: Db,
  analysisId: string,
  fileId: string,
): Promise<EdgeRow[]> {
  const rows: EdgeRow[] = [];

  for (let from = 0; ; ) {
    const { data, error } = await db
      .from("edges")
      .select("id, source_file_id, target_file_id, kind, line")
      .eq("analysis_id", analysisId)
      .or(`source_file_id.eq.${fileId},target_file_id.eq.${fileId}`)
      .order("id")
      .range(from, from + PAGE - 1);

    if (error) {
      throw new Error(`Reading connections failed: ${error.message}`);
    }

    rows.push(...data);
    if (data.length === 0) {
      return rows;
    }
    from += data.length;
  }
}

async function readFilesById(
  db: Db,
  analysisId: string,
  ids: readonly string[],
): Promise<FileRow[]> {
  const rows: FileRow[] = [];

  for (let index = 0; index < ids.length; index += ID_CHUNK) {
    const chunk = ids.slice(index, index + ID_CHUNK);
    const { data, error } = await db
      .from("files")
      .select("id, path, folder, lines, content_hash, exports")
      .eq("analysis_id", analysisId)
      .in("id", chunk);

    if (error) {
      throw new Error(`Reading connected files failed: ${error.message}`);
    }
    rows.push(...data);
  }

  return rows;
}

async function readRolesById(
  db: Db,
  analysisId: string,
  ids: readonly string[],
): Promise<Map<string, Role>> {
  const roles = new Map<string, Role>();

  for (let index = 0; index < ids.length; index += ID_CHUNK) {
    const chunk = ids.slice(index, index + ID_CHUNK);
    const { data, error } = await db
      .from("file_roles")
      .select("file_id, role")
      .eq("analysis_id", analysisId)
      .in("file_id", chunk);

    if (error) {
      throw new Error(`Reading connected roles failed: ${error.message}`);
    }

    for (const row of data) {
      if (!isRole(row.role)) {
        throw new Error(
          `Stored file role is not in the taxonomy: ${row.role}`,
        );
      }
      roles.set(row.file_id, row.role);
    }
  }

  return roles;
}

function neighbourRows(
  grouped: ReadonlyMap<string, ReadonlySet<EdgeKind>>,
  byId: ReadonlyMap<string, FileRow>,
  roleById: ReadonlyMap<string, Role>,
): NeighbourPrompt[] {
  return [...grouped.entries()]
    .map(([id, kinds]) => {
      const file = byId.get(id);
      if (!file) {
        throw new Error(`Connected file ${id} is missing from the map.`);
      }
      return {
        path: file.path,
        role: roleById.get(id) ?? null,
        exports: file.exports,
        kinds: EDGE_KINDS.filter((kind) => kinds.has(kind)),
        lines: file.lines,
      };
    })
    .sort((left, right) => left.path.localeCompare(right.path));
}

function addKind(
  into: Map<string, Set<EdgeKind>>,
  other: string,
  kind: EdgeKind,
): void {
  const kinds = into.get(other) ?? new Set<EdgeKind>();
  kinds.add(kind);
  into.set(other, kinds);
}

function readKind(value: string): EdgeKind {
  const kind = EDGE_KINDS.find((known) => known === value);
  if (!kind) {
    throw new Error(`Stored edge has an unknown kind: ${value}`);
  }
  return kind;
}

function compareBoundary(
  left: FolderBoundaryPrompt,
  right: FolderBoundaryPrompt,
): number {
  return (
    left.outside.localeCompare(right.outside) ||
    left.inside.localeCompare(right.inside) ||
    left.kind.localeCompare(right.kind)
  );
}
