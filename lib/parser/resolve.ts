import { existsSync, statSync } from "node:fs";
import { builtinModules } from "node:module";
import path from "node:path";
import ts from "typescript";

import {
  DEPENDENCY_DIRECTORIES,
  IGNORED_DIRECTORIES,
  SOURCE_EXTENSIONS,
  isDeclarationFile,
  isInside,
  isSourceFile,
  toPosixPath,
} from "./walk.ts";

export interface ResolutionConfig {
  configPath: string | null;
  options: ts.CompilerOptions;
  aliasPatterns: RegExp[];
}

export type Resolution =
  | { outcome: "resolved"; absolutePath: string }
  | { outcome: "external"; reason: string }
  | { outcome: "excluded"; absolutePath: string; target: string; reason: string }
  | { outcome: "unresolved"; reason: string; tried: string[] };

interface ResolveParams {
  root: string;
  importerAbsolutePath: string;
  specifier: string;
  config: ResolutionConfig;
  nodes: Set<string>;
  skipped: Map<string, string>;
}

const BUILTIN_MODULES = new Set(builtinModules);

/**
 * One config is loaded per package, so a monorepo's path aliases resolve
 * against the tsconfig that actually owns the importing file.
 */
export function createConfigLoader(root: string): {
  forFile(absolutePath: string): ResolutionConfig;
} {
  const byDirectory = new Map<string, ResolutionConfig>();
  const byConfigPath = new Map<string, ResolutionConfig>();

  function findConfig(startDirectory: string): string | null {
    let directory = startDirectory;
    while (directory === root || isInside(root, directory)) {
      for (const name of ["tsconfig.json", "jsconfig.json"]) {
        const candidate = path.join(directory, name);
        if (existsSync(candidate)) {
          return candidate;
        }
      }
      if (directory === root) {
        break;
      }
      const parent = path.dirname(directory);
      if (parent === directory) {
        break;
      }
      directory = parent;
    }
    return null;
  }

  function load(configPath: string): ResolutionConfig {
    const cached = byConfigPath.get(configPath);
    if (cached) {
      return cached;
    }

    const defaults = defaultCompilerOptions();
    let options = defaults;
    try {
      const read = ts.readConfigFile(configPath, ts.sys.readFile);
      if (!read.error) {
        const parsed = ts.parseJsonConfigFileContent(
          read.config,
          ts.sys,
          path.dirname(configPath),
          defaults,
          configPath,
        );
        options = { ...parsed.options, allowJs: true };
      }
    } catch {
      options = defaults;
    }

    const aliases = Object.keys(options.paths ?? {}).map(pathPatternToRegExp);
    const config: ResolutionConfig = {
      configPath,
      options,
      aliasPatterns: aliases,
    };
    byConfigPath.set(configPath, config);
    return config;
  }

  const fallbackConfig: ResolutionConfig = {
    configPath: null,
    options: defaultCompilerOptions(),
    aliasPatterns: [],
  };

  return {
    forFile(absolutePath: string): ResolutionConfig {
      const startDirectory = path.dirname(absolutePath);
      const cached = byDirectory.get(startDirectory);
      if (cached) {
        return cached;
      }
      const configPath = findConfig(startDirectory);
      const config = configPath ? load(configPath) : fallbackConfig;
      byDirectory.set(startDirectory, config);
      return config;
    },
  };
}

function defaultCompilerOptions(): ts.CompilerOptions {
  return {
    allowJs: true,
    checkJs: false,
    jsx: ts.JsxEmit.Preserve,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: ts.ScriptTarget.Latest,
    resolveJsonModule: true,
    allowImportingTsExtensions: true,
    noEmit: true,
  };
}

function pathPatternToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("(.*)");
  return new RegExp(`^${escaped}$`);
}

export function resolveModuleReference(params: ResolveParams): Resolution {
  const { root, importerAbsolutePath, specifier, config, nodes, skipped } = params;

  if (specifier.trim() === "") {
    return { outcome: "unresolved", reason: "empty module specifier", tried: [] };
  }

  if (isBuiltinModule(specifier)) {
    return { outcome: "external", reason: "Node built-in module" };
  }
  if (isUrl(specifier)) {
    return { outcome: "external", reason: "URL import" };
  }

  const result = ts.resolveModuleName(
    specifier,
    importerAbsolutePath,
    config.options,
    ts.sys,
  );

  if (result.resolvedModule) {
    const resolvedPath = path.resolve(result.resolvedModule.resolvedFileName);
    const relativePath = toPosixPath(path.relative(root, resolvedPath));

    if (!isInside(root, resolvedPath)) {
      return { outcome: "external", reason: "resolves outside the repository" };
    }

    const dependencyDirectory = relativePath
      .split("/")
      .find((segment) => DEPENDENCY_DIRECTORIES.has(segment));
    if (dependencyDirectory) {
      return {
        outcome: "external",
        reason: `resolves into dependency directory "${dependencyDirectory}"`,
      };
    }

    if (nodes.has(resolvedPath)) {
      return { outcome: "resolved", absolutePath: resolvedPath };
    }

    return {
      outcome: "excluded",
      absolutePath: resolvedPath,
      target: relativePath,
      reason: exclusionReason(root, resolvedPath, skipped),
    };
  }

  const exactFile = existingFile({
    root,
    importerAbsolutePath,
    specifier,
    config,
  });
  if (exactFile) {
    const relativePath = toPosixPath(path.relative(root, exactFile));
    const dependencyDirectory = relativePath
      .split("/")
      .find((segment) => DEPENDENCY_DIRECTORIES.has(segment));
    if (dependencyDirectory) {
      return {
        outcome: "external",
        reason: `resolves into dependency directory "${dependencyDirectory}"`,
      };
    }
    return {
      outcome: "excluded",
      absolutePath: exactFile,
      target: relativePath,
      reason: exclusionReason(root, exactFile, skipped),
    };
  }

  const internalIntent = looksInternal(specifier, config.aliasPatterns);
  if (!internalIntent) {
    return { outcome: "external", reason: "external package" };
  }

  return {
    outcome: "unresolved",
    reason: reasonForMissingModule(specifier, config.aliasPatterns),
    tried: describeCandidates(root, importerAbsolutePath, specifier, config),
  };
}

function isBuiltinModule(specifier: string): boolean {
  return specifier.startsWith("node:") || BUILTIN_MODULES.has(specifier);
}

function isUrl(specifier: string): boolean {
  if (/^[a-zA-Z]:[\\/]/.test(specifier)) {
    return false;
  }
  return /^[a-z][a-z0-9+.-]*:/i.test(specifier);
}

function looksInternal(specifier: string, aliasPatterns: RegExp[]): boolean {
  return (
    specifier.startsWith(".") ||
    specifier.startsWith("/") ||
    aliasPatterns.some((pattern) => pattern.test(specifier))
  );
}

function reasonForMissingModule(specifier: string, aliasPatterns: RegExp[]): string {
  if (specifier.startsWith(".") || specifier.startsWith("/")) {
    return "file not found";
  }
  if (aliasPatterns.some((pattern) => pattern.test(specifier))) {
    return "path alias matched but no file was found";
  }
  return "module not found";
}

function existingFile(params: {
  root: string;
  importerAbsolutePath: string;
  specifier: string;
  config: ResolutionConfig;
}): string | null {
  const { root, importerAbsolutePath, specifier, config } = params;
  for (const base of candidateBases(
    root,
    importerAbsolutePath,
    specifier,
    config,
  )) {
    if (!isInside(root, base)) {
      continue;
    }
    try {
      if (statSync(base).isFile()) {
        return base;
      }
    } catch {
      continue;
    }
  }
  return null;
}

function exclusionReason(
  root: string,
  absolutePath: string,
  skipped: Map<string, string>,
): string {
  if (isDeclarationFile(path.basename(absolutePath))) {
    return "declaration file";
  }
  if (!isSourceFile(absolutePath)) {
    return "not a TypeScript or JavaScript file";
  }

  const skipReason = skipped.get(path.resolve(absolutePath));
  if (skipReason) {
    return skipReason;
  }

  const relativePath = toPosixPath(path.relative(root, absolutePath));
  const ignoredDirectory = relativePath
    .split("/")
    .find((segment) => IGNORED_DIRECTORIES.has(segment));
  if (ignoredDirectory) {
    return `inside ignored directory "${ignoredDirectory}"`;
  }

  return "outside the selected file set";
}

function candidateBases(
  root: string,
  importerAbsolutePath: string,
  specifier: string,
  config: ResolutionConfig,
): string[] {
  if (specifier.startsWith(".") || specifier.startsWith("/")) {
    return [path.resolve(path.dirname(importerAbsolutePath), specifier)];
  }

  const baseDirectory = config.options.baseUrl
    ? path.resolve(config.options.baseUrl)
    : config.configPath
      ? path.dirname(config.configPath)
      : root;

  const bases: string[] = [];
  for (const [pattern, targets] of Object.entries(config.options.paths ?? {})) {
    const match = pathPatternToRegExp(pattern).exec(specifier);
    if (!match) {
      continue;
    }
    for (const target of targets) {
      let substituted = target;
      for (let index = 1; index < match.length; index += 1) {
        substituted = substituted.replace("*", match[index]);
      }
      bases.push(path.resolve(baseDirectory, substituted));
    }
  }

  if (config.options.baseUrl) {
    bases.push(path.resolve(baseDirectory, specifier));
  }

  return bases;
}

function describeCandidates(
  root: string,
  importerAbsolutePath: string,
  specifier: string,
  config: ResolutionConfig,
): string[] {
  const bases = candidateBases(
    root,
    importerAbsolutePath,
    specifier,
    config,
  );

  const candidates = new Set<string>();
  for (const base of bases) {
    const baseExtension = path.extname(base).toLowerCase();
    if ((SOURCE_EXTENSIONS as readonly string[]).includes(baseExtension)) {
      candidates.add(base);
      if ([".js", ".jsx", ".mjs", ".cjs"].includes(baseExtension)) {
        const stem = base.slice(0, -baseExtension.length);
        for (const extension of [".ts", ".tsx", ".mts", ".cts"]) {
          candidates.add(`${stem}${extension}`);
        }
      }
      continue;
    }

    candidates.add(base);
    for (const extension of SOURCE_EXTENSIONS) {
      candidates.add(`${base}${extension}`);
    }
    for (const extension of SOURCE_EXTENSIONS) {
      candidates.add(path.join(base, `index${extension}`));
    }
  }

  const relativeCandidates: string[] = [];
  for (const candidate of candidates) {
    const relativePath = toPosixPath(path.relative(root, candidate));
    if (
      relativePath === "" ||
      relativePath.startsWith("..") ||
      path.isAbsolute(relativePath)
    ) {
      continue;
    }
    relativeCandidates.push(relativePath);
    if (relativeCandidates.length === 8) {
      break;
    }
  }
  return relativeCandidates;
}
