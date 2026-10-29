// Files a framework or tool reaches without an import: pages, route handlers,
// controllers, layouts, middleware and config. The import graph was never
// going to show a connection that isn't an import, so these are left out of
// "nothing imports these" rather than reported as unused. The adapter's role
// says this for a repository the adapters recognised; the path conventions
// below keep the same answer for an older analysis with no stored roles.
import type { Role } from "@/lib/roles";

const ENTRY_ROLES: ReadonlySet<Role> = new Set<Role>([
  "page-route",
  "api-endpoint",
  "server-action",
  "router",
  "controller",
  "resolver",
  "gateway",
  "layout",
  "route-ui",
  "middleware",
  "metadata",
  "instrumentation",
  "config",
  "test",
]);

const CODE = /\.(?:[cm]?[jt]sx?)$/;

const APP_FILES = new Set([
  "page",
  "route",
  "layout",
  "template",
  "default",
  "loading",
  "error",
  "global-error",
  "not-found",
  "forbidden",
  "unauthorized",
  "sitemap",
  "robots",
  "manifest",
  "icon",
  "apple-icon",
  "opengraph-image",
  "twitter-image",
]);

const ROOT_FILES = new Set([
  "middleware",
  "proxy",
  "instrumentation",
  "instrumentation-client",
]);

const TOOL_CONFIG = /(?:^|\/)[^/]*\.config\.[cm]?[jt]s$/;
const TEST_FILE = /(?:^|\/)(?:__tests__|__mocks__)\//;
const TEST_NAME = /\.(?:test|spec)\.[cm]?[jt]sx?$/;

// In a monorepo the package sits above the project, so strip apps/<name>/ or
// packages/<name>/ and then src/. A path without either is left as it was.
function withoutProjectPrefix(path: string): string {
  const workspace = /^(?:apps|packages)\/[^/]+\//.exec(path);
  let projectPath = workspace ? path.slice(workspace[0].length) : path;

  if (projectPath.startsWith("src/")) {
    projectPath = projectPath.slice(4);
  }

  return projectPath;
}

export function isConventionEntry(file: {
  path: string;
  role: Role | null;
}): boolean {
  if (file.role !== null && ENTRY_ROLES.has(file.role)) {
    return true;
  }
  return pathConvention(file.path);
}

function pathConvention(path: string): boolean {
  if (!CODE.test(path)) {
    return false;
  }

  const projectPath = withoutProjectPrefix(path);
  const name = projectPath
    .slice(projectPath.lastIndexOf("/") + 1)
    .replace(CODE, "");

  if (projectPath.startsWith("app/")) {
    // A folder starting with "_" is private: Next.js never routes into it.
    const folders = projectPath.split("/").slice(1, -1);
    if (folders.some((folder) => folder.startsWith("_"))) {
      return false;
    }
    return APP_FILES.has(name);
  }

  if (projectPath.startsWith("pages/")) {
    return true;
  }

  if (TOOL_CONFIG.test(projectPath)) {
    return true;
  }

  if (TEST_FILE.test(projectPath) || TEST_NAME.test(projectPath)) {
    return true;
  }

  return !projectPath.includes("/") && ROOT_FILES.has(name);
}
