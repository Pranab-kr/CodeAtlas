import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { Node, Project, SyntaxKind, type SourceFile } from "ts-morph";

import type { Role } from "../roles.ts";
import { selectAdapter } from "./adapters/index.ts";
import type {
  AdapterFile,
  FrameworkAdapter,
  ProjectInfo,
} from "./adapter.ts";
import { extractExports } from "./exports.ts";
import { computeFanCounts } from "./graph.ts";
import { createConfigLoader, resolveModuleReference } from "./resolve.ts";
import type {
  ExcludedImport,
  ImportCoverage,
  ParseResult,
  ParsedEdge,
  ParsedFile,
  ReexportGap,
  RouteCoverage,
  SkippedFile,
  UnresolvedImport,
} from "./types.ts";
import {
  isDeclarationFile,
  isSourceFile,
  walkRepository,
  type DiscoveredFile,
} from "./walk.ts";

export interface ParseRepositoryOptions {
  adapter?: FrameworkAdapter;
}

type ReferenceKind = "import" | "reexport" | "dynamic" | "require";

interface ModuleReference {
  specifier: string;
  kind: ReferenceKind;
  line: number;
}

interface NonLiteralImport {
  specifier: string;
  kind: "dynamic" | "require";
  line: number;
  reason: string;
}

export function parseRepository(
  rootInput: string,
  options: ParseRepositoryOptions = {},
): ParseResult {
  const root = path.resolve(rootInput);
  const stats = statSync(root);
  if (!stats.isDirectory()) {
    throw new Error(`Not a directory: ${root}`);
  }

  const adapter = options.adapter ?? selectAdapter(readProject(root));
  const discovered = walkRepository(root);
  const configLoader = createConfigLoader(root);
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { allowJs: true },
  });

  const nodes = new Set(
    discovered.files.map((file) => path.resolve(file.absolutePath)),
  );
  const skippedReasons = new Map<string, string>();
  for (const skip of discovered.skipped) {
    skippedReasons.set(path.resolve(root, skip.path), skip.reason);
  }

  const parsedFiles: DiscoveredFile[] = [];
  const adapterFiles: AdapterFile[] = [];
  const parseFailures: SkippedFile[] = [];
  const roles = new Map<string, Role | null>();
  const exportNames = new Map<string, string[]>();
  const edgeMap = new Map<string, ParsedEdge>();
  const unresolvedImports: UnresolvedImport[] = [];
  const excludedImports: ExcludedImport[] = [];
  const reexportGaps: ReexportGap[] = [];
  const imports = { seen: 0, resolved: 0, external: 0, excluded: 0, unresolved: 0 };
  const reexports = { seen: 0, resolved: 0 };

  for (const file of discovered.files) {
    let references: ModuleReference[];
    let nonLiteral: NonLiteralImport[];
    let sourceFile: SourceFile;
    try {
      sourceFile = project.createSourceFile(
        file.absolutePath,
        file.source,
        { overwrite: true },
      );
      ({ references, nonLiteral } = extractReferences(sourceFile));
    } catch (error) {
      const reason = `parse failed: ${
        error instanceof Error ? error.message : String(error)
      }`;
      nodes.delete(path.resolve(file.absolutePath));
      skippedReasons.set(path.resolve(file.absolutePath), reason);
      parseFailures.push({ path: file.path, reason });
      continue;
    }

    parsedFiles.push(file);
    const adapterFile: AdapterFile = { path: file.path, source: sourceFile };
    adapterFiles.push(adapterFile);
    roles.set(file.path, adapter.roleOf(adapterFile));
    exportNames.set(file.path, extractExports(sourceFile));

    const config = configLoader.forFile(file.absolutePath);

    for (const bad of nonLiteral) {
      imports.seen += 1;
      imports.unresolved += 1;
      unresolvedImports.push({
        importer: file.path,
        specifier: bad.specifier,
        kind: bad.kind,
        line: bad.line,
        reason: bad.reason,
        tried: [],
      });
    }

    for (const reference of references) {
      if (reference.kind === "reexport") {
        reexports.seen += 1;
      } else {
        imports.seen += 1;
      }

      const resolution = resolveModuleReference({
        root,
        importerAbsolutePath: file.absolutePath,
        specifier: reference.specifier,
        config,
        nodes,
        skipped: skippedReasons,
      });

      if (resolution.outcome === "resolved") {
        if (reference.kind === "reexport") {
          reexports.resolved += 1;
        } else {
          imports.resolved += 1;
        }
        addEdge(edgeMap, file.path, resolution.absolutePath, root, reference);
        continue;
      }

      if (reference.kind === "reexport") {
        reexportGaps.push({
          importer: file.path,
          specifier: reference.specifier,
          line: reference.line,
          outcome: resolution.outcome,
          reason: resolution.reason,
        });
        continue;
      }

      if (resolution.outcome === "external") {
        imports.external += 1;
        continue;
      }

      if (resolution.outcome === "excluded") {
        imports.excluded += 1;
        excludedImports.push({
          importer: file.path,
          specifier: reference.specifier,
          kind: reference.kind,
          line: reference.line,
          target: resolution.target,
          reason: resolution.reason,
        });
        continue;
      }

      imports.unresolved += 1;
      unresolvedImports.push({
        importer: file.path,
        specifier: reference.specifier,
        kind: reference.kind,
        line: reference.line,
        reason: resolution.reason,
        tried: resolution.tried,
      });
    }
  }

  // Only source files whose syntax is unknown: a declaration file can't set a
  // global prefix, and counting it would withhold every route for no reason.
  const unparsed = [
    ...discovered.skipped
      .filter(mayHoldRouteSyntax)
      .map((skip) => skip.path),
    ...parseFailures.map((failure) => failure.path),
  ];
  const routeReport = adapter.routes({ files: adapterFiles, unparsed });

  const edges = [...edgeMap.values()].sort(compareEdges);
  const fans = computeFanCounts(parsedFiles, edges);

  const files: ParsedFile[] = parsedFiles.map((file) => ({
    path: file.path,
    folder: file.folder,
    lines: file.lines,
    contentHash: file.contentHash,
    role: roles.get(file.path) ?? null,
    fanIn: fans.get(file.path)?.fanIn ?? 0,
    fanOut: fans.get(file.path)?.fanOut ?? 0,
    exports: exportNames.get(file.path) ?? [],
  }));

  const skipped = [...discovered.skipped, ...parseFailures].sort((left, right) =>
    left.path.localeCompare(right.path),
  );

  const routes: RouteCoverage = {
    listed: routeReport.routes.length,
    omitted: routeReport.omitted.length,
    withheld: routeReport.withheld,
  };

  const coverage: ImportCoverage = {
    imports,
    reexports: {
      seen: reexports.seen,
      resolved: reexports.resolved,
      gaps: reexportGaps,
    },
    unresolved: unresolvedImports,
    excluded: excludedImports,
    routes,
  };

  return {
    framework: adapter.name,
    files,
    edges,
    routes: routeReport.routes,
    skipped,
    coverage,
  };
}

/**
 * Detection reads the root package.json only. A monorepo's nested manifests
 * don't choose the repository's adapter; the root says what this repo is.
 */
function readProject(root: string): ProjectInfo {
  const dependencies = new Set<string>();

  let raw: string;
  try {
    raw = readFileSync(path.join(root, "package.json"), "utf8");
  } catch {
    return { dependencies };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { dependencies };
  }

  if (typeof parsed !== "object" || parsed === null) {
    return { dependencies };
  }

  for (const field of ["dependencies", "devDependencies"]) {
    const record = Reflect.get(parsed, field);
    if (typeof record !== "object" || record === null) {
      continue;
    }
    for (const name of Object.keys(record)) {
      dependencies.add(name);
    }
  }

  return { dependencies };
}

function mayHoldRouteSyntax(skip: SkippedFile): boolean {
  if (
    skip.reason === "declaration file" ||
    skip.reason === "package manager generated file"
  ) {
    return false;
  }
  const name = skip.path.slice(skip.path.lastIndexOf("/") + 1);
  return isSourceFile(name) && !isDeclarationFile(name);
}

function extractReferences(sourceFile: SourceFile): {
  references: ModuleReference[];
  nonLiteral: NonLiteralImport[];
} {
  const references: ModuleReference[] = [];
  const nonLiteral: NonLiteralImport[] = [];

  for (const declaration of sourceFile.getImportDeclarations()) {
    const specifier = declaration.getModuleSpecifierValue();
    if (specifier !== undefined) {
      references.push({
        specifier,
        kind: "import",
        line: declaration.getStartLineNumber(),
      });
    }
  }

  for (const declaration of sourceFile.getExportDeclarations()) {
    const specifier = declaration.getModuleSpecifierValue();
    if (specifier !== undefined) {
      references.push({
        specifier,
        kind: "reexport",
        line: declaration.getStartLineNumber(),
      });
    }
  }

  for (const declaration of sourceFile.getDescendantsOfKind(
    SyntaxKind.ImportEqualsDeclaration,
  )) {
    const moduleReference = declaration.getModuleReference();
    if (!Node.isExternalModuleReference(moduleReference)) {
      continue;
    }

    const expression = moduleReference.getExpression();
    if (!expression) {
      nonLiteral.push({
        specifier: "",
        kind: "require",
        line: declaration.getStartLineNumber(),
        reason: "import equals reference has no module specifier",
      });
      continue;
    }

    if (
      Node.isStringLiteral(expression) ||
      Node.isNoSubstitutionTemplateLiteral(expression)
    ) {
      references.push({
        specifier: expression.getLiteralValue(),
        kind: "require",
        line: declaration.getStartLineNumber(),
      });
      continue;
    }

    nonLiteral.push({
      specifier: expression.getText(),
      kind: "require",
      line: declaration.getStartLineNumber(),
      reason: "import equals reference is not a string literal",
    });
  }

  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expression = call.getExpression();
    if (expression.getKind() === SyntaxKind.ImportKeyword) {
      const [argument] = call.getArguments();
      if (!argument) {
        nonLiteral.push({
          specifier: "",
          kind: "dynamic",
          line: call.getStartLineNumber(),
          reason: "dynamic import has no argument",
        });
        continue;
      }

      if (
        Node.isStringLiteral(argument) ||
        Node.isNoSubstitutionTemplateLiteral(argument)
      ) {
        references.push({
          specifier: argument.getLiteralValue(),
          kind: "dynamic",
          line: call.getStartLineNumber(),
        });
        continue;
      }

      nonLiteral.push({
        specifier: argument.getText(),
        kind: "dynamic",
        line: call.getStartLineNumber(),
        reason: "dynamic import argument is not a string literal",
      });
      continue;
    }

    if (!Node.isIdentifier(expression) || expression.getText() !== "require") {
      continue;
    }

    const [argument] = call.getArguments();
    if (!argument) {
      nonLiteral.push({
        specifier: "",
        kind: "require",
        line: call.getStartLineNumber(),
        reason: "require call has no argument",
      });
      continue;
    }

    if (
      Node.isStringLiteral(argument) ||
      Node.isNoSubstitutionTemplateLiteral(argument)
    ) {
      references.push({
        specifier: argument.getLiteralValue(),
        kind: "require",
        line: call.getStartLineNumber(),
      });
      continue;
    }

    nonLiteral.push({
      specifier: argument.getText(),
      kind: "require",
      line: call.getStartLineNumber(),
      reason: "require argument is not a string literal",
    });
  }

  return { references, nonLiteral };
}

function addEdge(
  edges: Map<string, ParsedEdge>,
  source: string,
  targetAbsolutePath: string,
  root: string,
  reference: ModuleReference,
): void {
  const target = rootRelativePath(root, targetAbsolutePath);
  const key = `${source}\u0000${target}\u0000${reference.kind}`;
  if (edges.has(key)) {
    return;
  }
  edges.set(key, {
    source,
    target,
    kind: reference.kind,
    specifier: reference.specifier,
    line: reference.line,
  });
}

function rootRelativePath(root: string, absolutePath: string): string {
  return path.relative(root, absolutePath).split(path.sep).join("/");
}

function compareEdges(left: ParsedEdge, right: ParsedEdge): number {
  return (
    left.source.localeCompare(right.source) ||
    left.target.localeCompare(right.target) ||
    left.kind.localeCompare(right.kind)
  );
}
