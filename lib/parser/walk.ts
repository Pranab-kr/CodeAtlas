import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import type { SkippedFile } from "./types.ts";

export const SOURCE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
] as const;

const SOURCE_EXTENSION_SET = new Set<string>(SOURCE_EXTENSIONS);

/** Directories whose contents are a dependency or build artifact, not source. */
export const DEPENDENCY_DIRECTORIES = new Set([
  "node_modules",
  "bower_components",
  "jspm_packages",
]);

export const IGNORED_DIRECTORIES = new Set([
  ...DEPENDENCY_DIRECTORIES,
  ".git",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".turbo",
  ".vercel",
  ".yarn",
  ".cache",
  ".parcel-cache",
  ".nyc_output",
  "dist",
  "build",
  "out",
  "coverage",
  "storybook-static",
  "tmp",
]);

const PACKAGE_MANAGER_FILES = new Set([
  ".pnp.cjs",
  ".pnp.js",
  ".pnp.loader.mjs",
]);

const DECLARATION_FILE = /\.d\.(ts|mts|cts)$/;

export interface DiscoveredFile {
  absolutePath: string;
  path: string;
  folder: string;
  source: string;
  lines: number;
  contentHash: string;
}

export interface WalkResult {
  files: DiscoveredFile[];
  skipped: SkippedFile[];
}

export function isSourceFile(fileName: string): boolean {
  return SOURCE_EXTENSION_SET.has(path.extname(fileName).toLowerCase());
}

export function isDeclarationFile(fileName: string): boolean {
  return DECLARATION_FILE.test(fileName);
}

export function toPosixPath(value: string): string {
  return value.split(path.sep).join("/");
}

export function folderOf(relativePath: string): string {
  return path.posix.dirname(relativePath);
}

export function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

/**
 * File selection is structural: every source file under a kept directory is a
 * node. Nothing is selected by size, and nothing is chosen by what it imports.
 */
export function walkRepository(root: string): WalkResult {
  const files: DiscoveredFile[] = [];
  const skipped: SkippedFile[] = [];

  function walk(directory: string, relativeDirectory: string): void {
    const entries = readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
      left.name.localeCompare(right.name),
    );

    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      const relativePath = relativeDirectory
        ? `${relativeDirectory}/${entry.name}`
        : entry.name;

      if (entry.isSymbolicLink()) {
        if (isSourceFile(entry.name)) {
          skipped.push({ path: relativePath, reason: "symbolic link" });
        }
        continue;
      }

      if (entry.isDirectory()) {
        if (IGNORED_DIRECTORIES.has(entry.name)) {
          continue;
        }
        walk(absolutePath, relativePath);
        continue;
      }

      if (!entry.isFile() || !isSourceFile(entry.name)) {
        continue;
      }

      if (isDeclarationFile(entry.name)) {
        skipped.push({ path: relativePath, reason: "declaration file" });
        continue;
      }

      if (PACKAGE_MANAGER_FILES.has(entry.name)) {
        skipped.push({ path: relativePath, reason: "package manager generated file" });
        continue;
      }

      let contents: Buffer;
      try {
        contents = readFileSync(absolutePath);
      } catch (error) {
        skipped.push({
          path: relativePath,
          reason: `unreadable: ${error instanceof Error ? error.message : String(error)}`,
        });
        continue;
      }

      const source = contents.toString("utf8");
      files.push({
        absolutePath,
        path: relativePath,
        folder: folderOf(relativePath),
        source,
        lines: countLines(source),
        contentHash: createHash("sha256").update(contents).digest("hex"),
      });
    }
  }

  walk(root, "");

  files.sort((left, right) => left.path.localeCompare(right.path));
  skipped.sort((left, right) => left.path.localeCompare(right.path));

  return { files, skipped };
}

function countLines(source: string): number {
  if (source.length === 0) {
    return 0;
  }
  const newlines = source.split("\n").length - 1;
  return source.endsWith("\n") ? newlines : newlines + 1;
}
