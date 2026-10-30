/**
 * The invented-path check. This is set membership with an exact answer, not a
 * model grading a model: every path-shaped token in an explanation must appear
 * in the exact set of paths the prompt handed over. Anything else was invented.
 *
 * The source is part of what the model was shown, so tokens found in it are
 * allowed too. That keeps a quoted import specifier such as `./client` from
 * being reported as a hallucination.
 */

const EXTENSIONS = String.raw`[cm]?[jt]sx?|json|mdx?|ya?ml|toml|css|scss|html|svg|txt`;
const EXTENSION = new RegExp(`\\.(?:${EXTENSIONS})$`);
const PREFIXED = /^(?:\.{1,2}\/|@\/)/;
// Technology names are written like filenames in prose. They are not claims
// about a repository file, so they are not judged as one.
const TECHNOLOGY_NAMES = new Set([
  "Node.js",
  "Next.js",
  "Nuxt.js",
  "Vue.js",
  "React.js",
  "Express.js",
  "Angular.js",
  "Ember.js",
  "Backbone.js",
  "Socket.io",
  "Three.js",
  "D3.js",
]);
// A run of path characters. Splitting on this and testing each run is linear;
// a single regex with nested quantifiers backtracks catastrophically on a long
// line of dots, which is exactly the kind of source this has to read.
const CANDIDATE = /[\w@./-]+/g;

/**
 * Every path-shaped token, in order, with duplicates removed. A token is
 * path-shaped when it has a relative or aliased prefix (`./`, `../`, `@/`), a
 * known file extension, or at least three segments. Route patterns without a
 * file extension (a leading `/` such as `/api/users`) are not repository paths.
 */
export function pathTokens(text: string): string[] {
  const seen = new Set<string>();
  const tokens: string[] = [];

  for (const match of text.matchAll(CANDIDATE)) {
    const token = trimCandidate(match[0]);
    if (!isPathShaped(token)) {
      continue;
    }
    if (token.startsWith("//") || (token.startsWith("/") && !EXTENSION.test(token))) {
      // A URL, a protocol-relative path, or an extension-less route.
      continue;
    }
    if (!/[a-z]/.test(token) || /^[\d/.-]+$/.test(token)) {
      // `TCP/IP/UDP`, `2026/10/30` and similar are not repository paths.
      continue;
    }
    if (!token.includes("/") && TECHNOLOGY_NAMES.has(token)) {
      continue;
    }

    const key = normalizePath(token);
    if (key === "" || seen.has(key)) {
      continue;
    }
    seen.add(key);
    tokens.push(token);
  }

  return tokens;
}

/** The tokens in `text` that are absent from `allowed`. */
export function inventedPaths(
  text: string,
  allowed: readonly string[],
): string[] {
  const allowedSet = new Set(allowed.map(normalizePath).filter(Boolean));

  return pathTokens(text).filter(
    (token) => !allowedSet.has(normalizePath(token)),
  );
}

/**
 * The exact set of paths a file prompt showed: the target, its folder, every
 * neighbour in either direction, and any path-shaped token in the source.
 */
export interface FilePathContext {
  path: string;
  folder: string;
  imports: readonly { path: string }[];
  importedBy: readonly { path: string }[];
}

export function fileAllowedPaths(
  context: FilePathContext,
  source?: string,
): string[] {
  const paths = [
    context.path,
    context.folder,
    ...context.imports.map((file) => file.path),
    ...context.importedBy.map((file) => file.path),
  ];
  if (source !== undefined) {
    paths.push(...pathTokens(source));
  }
  return uniquePaths(paths);
}

/** The exact set of paths a folder prompt showed. */
export interface FolderPathContext {
  id: string;
  label: string;
  files: readonly { path: string }[];
  inbound: readonly { outside: string; inside: string }[];
  outbound: readonly { outside: string; inside: string }[];
}

export function folderAllowedPaths(context: FolderPathContext): string[] {
  return uniquePaths([
    context.id,
    context.label,
    ...context.files.map((file) => file.path),
    ...context.inbound.flatMap((edge) => [edge.outside, edge.inside]),
    ...context.outbound.flatMap((edge) => [edge.inside, edge.outside]),
  ]);
}

export function normalizePath(value: string): string {
  return value
    .trim()
    .replace(/^\.\//, "")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
}

function isPathShaped(token: string): boolean {
  if (token === "") {
    return false;
  }
  if (PREFIXED.test(token) || EXTENSION.test(token)) {
    return true;
  }
  return token.includes("/") && token.split("/").length > 2;
}

function trimCandidate(value: string): string {
  // Trailing dots and slashes are sentence punctuation or a trailing folder
  // separator, not part of the name. Leading dots stay: they carry "./" and
  // "../" and dot-directories.
  return value.replace(/[./]+$/, "");
}

function uniquePaths(values: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = normalizePath(value);
    if (normalized !== "") {
      seen.add(normalized);
    }
  }
  return [...seen].sort();
}
