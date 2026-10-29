import type { SourceFile } from "ts-morph";

import type { Framework, Role } from "../roles.ts";
import type { ParsedRoute } from "./types.ts";

export interface ProjectInfo {
  /** Every name in the root package.json's dependencies and devDependencies. */
  dependencies: ReadonlySet<string>;
}

/** A file that parsed cleanly, with the syntax tree the adapter reads. */
export interface AdapterFile {
  path: string;
  source: SourceFile;
}

export interface RouteSources {
  files: readonly AdapterFile[];
  /** Source files whose syntax is unknown, so they may change every pattern. */
  unparsed: readonly string[];
}

export interface OmittedRoute {
  path: string;
  line: number;
  reason: string;
}

export interface RouteReport {
  routes: ParsedRoute[];
  /** Declarations left out because the method or full pattern isn't written. */
  omitted: OmittedRoute[];
  /** Set when something project-wide makes every pattern uncertain. */
  withheld: string | null;
}

export const NO_ROUTES: RouteReport = {
  routes: [],
  omitted: [],
  withheld: null,
};

/**
 * Framework knowledge lives behind this interface. The parser never asks what
 * framework a repository uses; it hands each file to the adapter and asks for
 * roles and routes.
 */
export interface FrameworkAdapter {
  readonly name: Framework;
  /** Whether this adapter applies to the project. */
  detect(project: ProjectInfo): boolean;
  /**
   * The file's role from a convention: where it sits, what it's named, or a
   * directive or syntax it contains. Null when none applies.
   */
  roleOf(file: AdapterFile): Role | null;
  /** Routes whose method and full pattern are both written in the syntax. */
  routes(sources: RouteSources): RouteReport;
}
