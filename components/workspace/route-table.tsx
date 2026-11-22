"use client";

import type { Selection } from "@/lib/graph/selection";
import type { ParsedRoute, RouteCoverage } from "@/lib/parser/types";
import { cn } from "@/lib/utils";

function methodTone(method: string): string {
  switch (method.toUpperCase()) {
    case "GET":
      return "bg-incoming/12 text-incoming ring-incoming/25";
    case "POST":
      return "bg-outgoing/12 text-outgoing ring-outgoing/25";
    case "PUT":
    case "PATCH":
      return "bg-selection/12 text-selection ring-selection/25";
    case "DELETE":
      return "bg-destructive/12 text-destructive ring-destructive/25";
    default:
      return "bg-well text-foreground ring-hairline";
  }
}

// Every route the adapters recovered, one row per method and pattern.
// Clicking a row selects the file that declares it, so the pane shows that
// file while the table stays open. Nothing here is inferred: what the adapters
// couldn't read exactly is counted below, not guessed into a row.
export function RouteTable({
  routes,
  coverage,
  selection,
  hover,
  onReveal,
  onHover,
}: {
  routes: readonly ParsedRoute[];
  /** Null for an analysis stored before routes were extracted. */
  coverage: RouteCoverage | null;
  selection: Selection;
  hover: Selection;
  onReveal(path: string): void;
  onHover(hover: Selection): void;
}) {
  const selectedFile = selection?.kind === "file" ? selection.path : null;
  const hoveredFile = hover?.kind === "file" ? hover.path : null;

  return (
    <div className="atlas-scroll absolute inset-0 overflow-y-auto bg-surface text-[12px]">
      <div className="border-b border-hairline bg-chrome/60 px-4 py-2 text-[11.5px] text-muted-foreground">
        Listed only where the method and the full path are both written in the
        code.
      </div>

      {coverage?.withheld ? (
        <div className="border-b border-hairline bg-well/50 px-4 py-2.5 text-[12px]">
          <span className="font-medium text-foreground">No routes listed: </span>
          <span className="text-muted-foreground">
            {coverage.withheld}.
          </span>
        </div>
      ) : null}

      {routes.length === 0 ? (
        coverage?.withheld ? null : (
          <div className="px-4 py-8 text-center text-[12.5px] text-muted-foreground">
            {coverage === null
              ? "Route extraction wasn't stored for this analysis. Run it again to extract routes."
              : "No routes found in this analysis."}
          </div>
        )
      ) : (
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10 bg-chrome/95 backdrop-blur-xs">
            <tr className="h-8 border-b border-hairline text-left text-[11px] font-medium text-muted-foreground">
              <th className="w-24 px-4 font-medium">Method</th>
              <th className="px-3 font-medium">Pattern</th>
              <th className="px-4 font-medium">Declared in</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {routes.map((route) => {
              const selected = route.path === selectedFile;
              const hovered = route.path === hoveredFile;
              return (
                <tr
                  key={`${route.method} ${route.pattern} ${route.path}:${route.line}`}
                  onClick={() => onReveal(route.path)}
                  onMouseEnter={() =>
                    onHover({ kind: "file", path: route.path })
                  }
                  onMouseLeave={() => onHover(null)}
                  className={cn(
                    "h-9 cursor-pointer transition-colors",
                    selected
                      ? "bg-selection/12 shadow-[inset_2px_0_0_var(--selection)]"
                      : hovered
                        ? "bg-well/70"
                        : "hover:bg-well/50",
                  )}
                >
                  <td className="px-4">
                    <span
                      className={cn(
                        "inline-flex h-5 items-center rounded-md px-1.5 font-mono text-[10.5px] font-medium ring-1 ring-inset",
                        methodTone(route.method),
                      )}
                    >
                      {route.method}
                    </span>
                  </td>
                  <td className="px-3 font-mono text-[11.5px] text-foreground break-all">
                    {route.pattern}
                  </td>
                  <td
                    className="px-4 font-mono text-[11.5px] text-muted-foreground"
                    title={route.path}
                  >
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onReveal(route.path);
                      }}
                      onFocus={() =>
                        onHover({ kind: "file", path: route.path })
                      }
                      onBlur={() => onHover(null)}
                      className="text-left break-all transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:underline"
                    >
                      {route.path}
                      <span className="text-muted-foreground/70">
                        :{route.line}
                      </span>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {coverage !== null && coverage.omitted > 0 ? (
        <p className="border-t border-hairline bg-chrome/50 px-4 py-2.5 text-[11.5px] text-muted-foreground">
          {coverage.omitted}{" "}
          {coverage.omitted === 1 ? "declaration is" : "declarations are"} not
          listed because the method or full path is not written out.
        </p>
      ) : null}
    </div>
  );
}
