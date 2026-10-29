// Conventions that hold whatever the framework: tools that load their config by
// file name, and test runners that collect files by pattern.
import type { Role } from "../../roles.ts";

// Named rather than matching any "*.config.*", so a module someone happened to
// call app.config.ts isn't claimed to be loaded by a tool.
const CONFIG_TOOLS = [
  "astro",
  "babel",
  "commitlint",
  "cypress",
  "eslint",
  "jest",
  "next",
  "playwright",
  "postcss",
  "prettier",
  "rollup",
  "stylelint",
  "svelte",
  "tailwind",
  "tsup",
  "vite",
  "vitest",
  "webpack",
];
const CONFIG_FILE = new RegExp(
  `^(${CONFIG_TOOLS.join("|")})\\.config\\.[cm]?[jt]s$`,
);
const RC_FILE =
  /^\.(babel|eslint|lintstaged|mocha|prettier|stylelint|commitlint)rc\.[cm]?js$/;
// The default include patterns of Jest and Vitest.
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;
const TEST_DIR = /(^|\/)__tests__\//;

export function toolRole(path: string): Role | null {
  const name = path.slice(path.lastIndexOf("/") + 1);
  if (CONFIG_FILE.test(name) || RC_FILE.test(name)) {
    return "config";
  }
  if (TEST_FILE.test(name) || TEST_DIR.test(path)) {
    return "test";
  }
  return null;
}
