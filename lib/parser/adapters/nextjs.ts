import { Node, SyntaxKind, type SourceFile } from "ts-morph";

import type { Role } from "../../roles.ts";
import type {
  FrameworkAdapter,
  RouteReport,
  RouteSources,
} from "../adapter.ts";
import { toolRole } from "./conventions.ts";
import { reactRole } from "./react.ts";
import { isRouteMethod, type RouteMethod } from "../types.ts";

// Next.js reaches files by where they sit: app/ and pages/ routing, and a few
// files at the project root. Either may live under src/.

const CODE = /\.(js|jsx|ts|tsx)$/;
type Convention = { role: Role };

// The file names the app router treats specially. Anything else under app/ is
// an ordinary module that something has to import.
const APP_FILES: Record<string, Convention> = {
  page: { role: "page-route" },
  route: { role: "api-endpoint" },
  layout: { role: "layout" },
  template: { role: "layout" },
  default: { role: "layout" },
  loading: { role: "route-ui" },
  error: { role: "route-ui" },
  "global-error": { role: "route-ui" },
  "not-found": { role: "route-ui" },
  forbidden: { role: "route-ui" },
  unauthorized: { role: "route-ui" },
  sitemap: { role: "metadata" },
  robots: { role: "metadata" },
  manifest: { role: "metadata" },
  icon: { role: "metadata" },
  "apple-icon": { role: "metadata" },
  "opengraph-image": { role: "metadata" },
  "twitter-image": { role: "metadata" },
};
// The pages router's own files at the top of pages/. Every other file there is
// a page.
const PAGES_FILES: Record<string, Convention> = {
  _app: { role: "layout" },
  _document: { role: "layout" },
  _error: { role: "route-ui" },
  "404": { role: "route-ui" },
  "500": { role: "route-ui" },
};
const ROOT_FILES: Record<string, Convention> = {
  middleware: { role: "middleware" },
  proxy: { role: "middleware" },
  instrumentation: { role: "instrumentation" },
  "instrumentation-client": { role: "instrumentation" },
};

const CONFIG = /^next\.config\.[cm]?[jt]s$/;

export const nextjsAdapter: FrameworkAdapter = {
  name: "Next.js",
  detect: (project) => project.dependencies.has("next"),
  roleOf(file) {
    return (
      nextConvention(file.path)?.role ??
      toolRole(file.path) ??
      (usesServer(file.source) ? "server-action" : reactRole(file))
    );
  },
  routes: nextRoutes,
};

function withoutSrc(path: string): string {
  return path.startsWith("src/") ? path.slice(4) : path;
}

function nextConvention(path: string): Convention | null {
  if (!CODE.test(path)) {
    return null;
  }
  const projectPath = withoutSrc(path);
  const name = projectPath
    .slice(projectPath.lastIndexOf("/") + 1)
    .replace(CODE, "");

  if (projectPath.startsWith("app/")) {
    // A folder starting with "_" is private: nothing inside it is routed.
    if (appSegments(projectPath).some((segment) => segment.startsWith("_"))) {
      return null;
    }
    return APP_FILES[name] ?? null;
  }
  if (projectPath.startsWith("pages/api/")) {
    return { role: "api-endpoint" };
  }
  if (projectPath.startsWith("pages/")) {
    const top = projectPath.slice("pages/".length).includes("/")
      ? undefined
      : PAGES_FILES[name];
    return top ?? { role: "page-route" };
  }
  if (!projectPath.includes("/")) {
    return ROOT_FILES[name] ?? null;
  }
  return null;
}

/** The folders between app/ and the file. */
function appSegments(projectPath: string): string[] {
  return projectPath.split("/").slice(1, -1);
}

// A module whose directive prologue says "use server": every export is a
// server action. An inline directive inside one function doesn't make the
// file one.
function usesServer(source: SourceFile): boolean {
  for (const statement of source.getStatements()) {
    if (!Node.isExpressionStatement(statement)) {
      return false;
    }
    const expression = statement.getExpression();
    if (!Node.isStringLiteral(expression)) {
      return false;
    }
    if (expression.getLiteralValue() === "use server") {
      return true;
    }
  }
  return false;
}

// Route handlers only. The pattern is the folder path, which Next.js defines
// exactly; the method is the name of an export. A page has no method written
// anywhere, and a pages/api handler picks its method at runtime, so neither is
// listed.
function nextRoutes({ files, unparsed }: RouteSources): RouteReport {
  const report: RouteReport = { routes: [], omitted: [], withheld: null };
  const withhold = (reason: string): RouteReport => ({ ...report, withheld: reason });

  // basePath prefixes every route, so the config has to be read before any
  // pattern is known.
  const configs = files.filter((file) => CONFIG.test(file.path));
  const unreadConfig = unparsed.find((path) => CONFIG.test(path));
  if (unreadConfig) {
    return withhold(`${unreadConfig} couldn't be parsed, so basePath is unknown`);
  }
  let basePath = "";
  for (const config of configs) {
    const read = readConfig(config.source);
    if ("withheld" in read) {
      return withhold(`${config.path} ${read.withheld}`);
    }
    if (read.basePath !== null) {
      if (basePath !== "" && basePath !== read.basePath) {
        return withhold("more than one next.config sets basePath");
      }
      basePath = read.basePath;
    }
  }

  for (const file of files) {
    const projectPath = withoutSrc(file.path);
    if (nextConvention(file.path)?.role !== "api-endpoint") {
      continue;
    }

    if (projectPath.startsWith("pages/api/")) {
      report.omitted.push({
        path: file.path,
        line: 1,
        reason: "a pages/api handler chooses its method at runtime",
      });
      continue;
    }

    const segments = appSegments(projectPath);
    const intercepting = segments.find((segment) => segment.startsWith("(."));
    if (intercepting) {
      report.omitted.push({
        path: file.path,
        line: 1,
        reason: `${intercepting} is an intercepting segment, which matches by navigation, not by path`,
      });
      continue;
    }
    if (segments.some((segment) => segment.includes("%"))) {
      report.omitted.push({
        path: file.path,
        line: 1,
        reason: "a folder name is URL-encoded",
      });
      continue;
    }
    // Route groups and parallel-route slots are left out of the URL by definition.
    const kept = segments.filter(
      (segment) => !/^\(.*\)$/.test(segment) && !segment.startsWith("@"),
    );
    const pattern = `${basePath}/${kept.join("/")}`.replace(/\/$/, "") || "/";

    const { methods, starExport } = exportedMethods(file.source);
    for (const { method, line } of methods) {
      report.routes.push({ path: file.path, method, pattern, line });
    }
    if (starExport !== null) {
      report.omitted.push({
        path: file.path,
        line: starExport,
        reason: "export * hides which methods come from the other module",
      });
    } else if (methods.length === 0) {
      report.omitted.push({
        path: file.path,
        line: 1,
        reason: "no exported HTTP method was found",
      });
    }
  }
  return report;
}

type ConfigRead = { basePath: string | null } | { withheld: string };

// Any property called basePath or pageExtensions, wherever it sits: the config
// is usually an object literal, but it may be built by a function, and a
// property anywhere in the file could be the one Next.js reads.
function readConfig(source: SourceFile): ConfigRead {
  let basePath: string | null = null;
  for (const property of source.getDescendantsOfKind(
    SyntaxKind.PropertyAssignment,
  )) {
    const name = property.getName().replace(/^["']|["']$/g, "");
    if (name === "pageExtensions") {
      return {
        withheld:
          "sets pageExtensions, so which files are route handlers is uncertain",
      };
    }
    if (name !== "basePath") {
      continue;
    }
    const value = property.getInitializer();
    if (
      !value ||
      !(Node.isStringLiteral(value) || Node.isNoSubstitutionTemplateLiteral(value))
    ) {
      return { withheld: "sets basePath to a computed value" };
    }
    if (basePath !== null && basePath !== value.getLiteralValue()) {
      return { withheld: "sets basePath more than once" };
    }
    basePath = value.getLiteralValue();
  }
  for (const shorthand of source.getDescendantsOfKind(
    SyntaxKind.ShorthandPropertyAssignment,
  )) {
    if (shorthand.getName() === "basePath") {
      return { withheld: "sets basePath from a variable" };
    }
    if (shorthand.getName() === "pageExtensions") {
      return {
        withheld:
          "sets pageExtensions, so which files are route handlers is uncertain",
      };
    }
  }
  return { basePath };
}

function exportedMethods(source: SourceFile): {
  methods: { method: RouteMethod; line: number }[];
  starExport: number | null;
} {
  const methods = new Map<RouteMethod, number>();
  const add = (name: string, line: number) => {
    if (isRouteMethod(name) && !methods.has(name)) {
      methods.set(name, line);
    }
  };
  let starExport: number | null = null;

  for (const statement of source.getStatements()) {
    // A default export named GET is still the default export, not GET.
    const exported =
      Node.isExportable(statement) &&
      statement.hasExportKeyword() &&
      !statement.hasDefaultKeyword();
    if (Node.isFunctionDeclaration(statement) && exported) {
      const name = statement.getName();
      if (name) {
        add(name, statement.getStartLineNumber());
      }
    } else if (Node.isVariableStatement(statement) && exported) {
      // `export const GET = …` and `export const { GET, POST } = handlers`.
      for (const declaration of statement.getDeclarations()) {
        const binding = declaration.getNameNode();
        if (Node.isIdentifier(binding)) {
          add(binding.getText(), declaration.getStartLineNumber());
        } else if (Node.isObjectBindingPattern(binding)) {
          for (const element of binding.getElements()) {
            add(element.getName(), element.getStartLineNumber());
          }
        }
      }
    } else if (Node.isExportDeclaration(statement)) {
      // `export { handler as GET }`, with or without a module specifier.
      if (statement.isNamespaceExport() && !statement.getNamespaceExport()) {
        starExport ??= statement.getStartLineNumber();
        continue;
      }
      for (const specifier of statement.getNamedExports()) {
        add(
          specifier.getAliasNode()?.getText() ?? specifier.getName(),
          specifier.getStartLineNumber(),
        );
      }
    }
  }
  return {
    methods: [...methods].map(([method, line]) => ({ method, line })),
    starExport,
  };
}
