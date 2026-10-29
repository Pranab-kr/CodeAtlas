import {
  Node,
  SyntaxKind,
  type Decorator,
  type Expression,
  type SourceFile,
} from "ts-morph";

import type { Role } from "../../roles.ts";
import type {
  FrameworkAdapter,
  RouteReport,
  RouteSources,
} from "../adapter.ts";
import { toolRole } from "./conventions.ts";
import type { RouteMethod } from "../types.ts";

// NestJS names a file for what it holds — users.controller.ts,
// users.service.ts — which is the suffix its CLI generates. Routes are
// assembled from the controller's decorator and the method's together, plus a
// global prefix if the bootstrap sets one.

const SUFFIX_ROLES: Record<string, Role> = {
  controller: "controller",
  resolver: "resolver",
  gateway: "gateway",
  service: "service",
  module: "module",
  entity: "entity",
  dto: "dto",
  repository: "repository",
  middleware: "middleware",
  guard: "guard",
  interceptor: "interceptor",
  pipe: "pipe",
  filter: "filter",
};
const SUFFIX = new RegExp(
  `\\.(${Object.keys(SUFFIX_ROLES).join("|")})\\.[cm]?[jt]s$`,
);

// The route decorators @nestjs/common exports, and the method each one maps.
const METHOD_DECORATORS: Record<string, RouteMethod> = {
  Get: "GET",
  Post: "POST",
  Put: "PUT",
  Delete: "DELETE",
  Patch: "PATCH",
  Options: "OPTIONS",
  Head: "HEAD",
};
// Declarations that are routes, but not one method and one pattern.
const OTHER_METHOD_DECORATORS = new Set(["Search", "All"]);

export const nestjsAdapter: FrameworkAdapter = {
  name: "NestJS",
  detect: (project) => project.dependencies.has("@nestjs/core"),
  roleOf(file) {
    const suffix = SUFFIX.exec(
      file.path.slice(file.path.lastIndexOf("/") + 1),
    );
    return (suffix?.[1] ? SUFFIX_ROLES[suffix[1]] : undefined) ?? toolRole(file.path);
  },
  routes: nestRoutes,
};

function nestRoutes({ files, unparsed }: RouteSources): RouteReport {
  const report: RouteReport = { routes: [], omitted: [], withheld: null };
  const withhold = (reason: string): RouteReport => ({ ...report, withheld: reason });

  // Anything that changes every pattern from outside the controllers has to be
  // known before any single pattern is.
  if (unparsed.length > 0) {
    return withhold(
      `${unparsed.length} file${unparsed.length === 1 ? " wasn't" : "s weren't"} parsed, and one could set a global prefix`,
    );
  }
  let bootstraps = 0;
  const prefixes: { path: string; value: string | null; hasOptions: boolean }[] = [];
  for (const { path, source } of files) {
    for (const call of source.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const callee = call.getExpression();
      if (!Node.isPropertyAccessExpression(callee)) {
        continue;
      }
      const name = callee.getName();
      if (name === "enableVersioning") {
        return withhold(
          `${path} enables versioning, which can add a version to any path`,
        );
      }
      if (
        name === "create" &&
        callee.getExpression().getText() === "NestFactory"
      ) {
        bootstraps++;
      }
      if (name === "setGlobalPrefix") {
        const [first, ...rest] = call.getArguments();
        prefixes.push({
          path,
          value: first ? literalString(first) : null,
          hasOptions: rest.length > 0,
        });
      }
    }
    if (
      [...importsFrom(source, "@nestjs/core").values()].includes("RouterModule")
    ) {
      return withhold(`${path} uses RouterModule, which prefixes whole modules`);
    }
  }
  let prefix = "";
  if (prefixes.length > 0) {
    const [only, ...more] = prefixes;
    if (!only || more.length > 0) {
      return withhold("setGlobalPrefix is called more than once");
    }
    if (bootstraps !== 1) {
      return withhold(
        `setGlobalPrefix is called, but there are ${bootstraps} bootstraps it could apply to`,
      );
    }
    if (only.value === null) {
      return withhold(`${only.path} sets the global prefix to a computed value`);
    }
    if (only.hasOptions) {
      return withhold(
        `${only.path} excludes some routes from the global prefix`,
      );
    }
    prefix = only.value;
  }

  for (const { path, source } of files) {
    const common = importsFrom(source, "@nestjs/common");
    const decoratorName = (decorator: Decorator): string | undefined => {
      const call = decorator.getCallExpression();
      const callee = call?.getExpression();
      return callee && Node.isIdentifier(callee)
        ? common.get(callee.getText())
        : undefined;
    };

    // A route key is per file, method and pattern. Two declarations in one
    // file would make the stored route insert refuse the whole chunk.
    const seenRoutes = new Set(
      report.routes
        .filter((route) => route.path === path)
        .map((route) => `${route.method}\u0000${route.pattern}`),
    );

    for (const cls of source.getClasses()) {
      const controller = cls
        .getDecorators()
        .find((decorator) => decoratorName(decorator) === "Controller");
      if (!controller) {
        continue;
      }
      const bases = controllerPaths(controller);
      if ("reason" in bases) {
        report.omitted.push({
          path,
          line: controller.getStartLineNumber(),
          reason: bases.reason,
        });
        continue;
      }
      const versionedClass = cls
        .getDecorators()
        .find((decorator) => decoratorName(decorator) === "Version");
      if (versionedClass) {
        report.omitted.push({
          path,
          line: versionedClass.getStartLineNumber(),
          reason: "@Version() adds a version to the path",
        });
        continue;
      }
      for (const method of cls.getMethods()) {
        const versioned = method
          .getDecorators()
          .find((decorator) => decoratorName(decorator) === "Version");
        if (versioned) {
          report.omitted.push({
            path,
            line: versioned.getStartLineNumber(),
            reason: "@Version() adds a version to the path",
          });
          continue;
        }
        for (const decorator of method.getDecorators()) {
          const name = decoratorName(decorator);
          if (name === undefined) {
            continue;
          }
          const line = decorator.getStartLineNumber();
          if (OTHER_METHOD_DECORATORS.has(name)) {
            report.omitted.push({
              path,
              line,
              reason: `@${name}() doesn't name a single method and pattern`,
            });
            continue;
          }
          const verb = METHOD_DECORATORS[name];
          if (!verb) {
            continue;
          }
          const own = pathArgument(decorator.getArguments()[0]);
          if (own === null) {
            report.omitted.push({
              path,
              line,
              reason: `@${name}() is given a path that isn't a string literal`,
            });
            continue;
          }
          for (const base of bases.paths) {
            for (const tail of own) {
              const pattern = joinPath([prefix, base, tail]);
              const key = `${verb}\u0000${pattern}`;
              if (seenRoutes.has(key)) {
                continue;
              }
              seenRoutes.add(key);
              report.routes.push({
                path,
                method: verb,
                pattern,
                line,
              });
            }
          }
        }
      }
    }
  }
  return report;
}

type ControllerPaths = { paths: string[] } | { reason: string };

/** The paths @Controller() puts in front of its methods, or why they aren't known. */
function controllerPaths(decorator: Decorator): ControllerPaths {
  const [argument] = decorator.getArguments();
  if (argument && Node.isObjectLiteralExpression(argument)) {
    if (argument.getProperty("version")) {
      return {
        reason: "@Controller() sets a version, which changes the path",
      };
    }
    const path = argument.getProperty("path");
    if (!path) {
      return { paths: [""] };
    }
    if (!Node.isPropertyAssignment(path)) {
      return {
        reason: "@Controller() is given a path that isn't a string literal",
      };
    }
    const values = pathArgument(path.getInitializer());
    return values === null
      ? {
          reason: "@Controller() is given a path that isn't a string literal",
        }
      : { paths: values };
  }
  const values = pathArgument(argument);
  return values === null
    ? { reason: "@Controller() is given a path that isn't a string literal" }
    : { paths: values };
}

/** No argument is the empty path; a literal or an array of literals is those paths; anything else is unknown. */
function pathArgument(argument: Node | undefined): string[] | null {
  if (argument === undefined) {
    return [""];
  }
  if (Node.isArrayLiteralExpression(argument)) {
    const values = argument.getElements().map(literalString);
    return values.length > 0 && values.every((value) => value !== null)
      ? values.filter((value) => value !== null)
      : null;
  }
  const value = literalString(argument);
  return value === null ? null : [value];
}

function literalString(node: Node | Expression): string | null {
  return Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node)
    ? node.getLiteralValue()
    : null;
}

// What Nest does joining the pieces: each gets one leading slash and loses its
// trailing ones, empty pieces drop out, and nothing at all is "/".
function joinPath(pieces: string[]): string {
  const joined = pieces
    .map((piece) => piece.replace(/\/+$/, ""))
    .filter((piece) => piece !== "")
    .map((piece) => (piece.startsWith("/") ? piece : `/${piece}`))
    .join("");
  return joined === "" ? "/" : joined;
}

/** Local name → exported name, for the named imports from one module. */
function importsFrom(source: SourceFile, module: string): Map<string, string> {
  const names = new Map<string, string>();
  for (const declaration of source.getImportDeclarations()) {
    if (declaration.getModuleSpecifierValue() !== module) {
      continue;
    }
    for (const specifier of declaration.getNamedImports()) {
      names.set(
        specifier.getAliasNode()?.getText() ?? specifier.getName(),
        specifier.getName(),
      );
    }
  }
  return names;
}
