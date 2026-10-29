"use client";

import type { Selection } from "@/lib/graph/selection";
import type { ParsedRoute, RouteCoverage } from "@/lib/parser/types";
import { cn } from "@/lib/utils";

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
    <div className="absolute inset-0 overflow-y-auto bg-background text-[11px]">
      <p className="border-b border-border px-3 py-1.5 text-muted-foreground">
        Listed only where the method and the full path are both written in the
        code.
      </p>

      {coverage?.withheld ? (
        <p className="border-b border-border px-3 py-1.5">
          <span className="text-foreground">No routes listed: </span>
          <span className="text-muted-foreground">
            {coverage.withheld}.
          </span>
        </p>
      ) : null}

      {routes.length === 0 ? (
        coverage?.withheld ? null : (
          <p className="px-3 py-2 text-muted-foreground">
            {coverage === null
              ? "Route extraction wasn't stored for this analysis. Run it again to extract routes."
              : "No routes."}
          </p>
        )
      ) : (
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="h-[22px] border-b border-border text-left text-[10px] text-muted-foreground">
              <th className="w-16 px-3 font-normal">Method</th>
              <th className="px-3 font-normal">Pattern</th>
              <th className="px-3 font-normal">Declared in</th>
            </tr>
          </thead>
          <tbody>
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
                    "h-[22px] cursor-pointer font-mono",
                    selected
                      ? "bg-selection/15 shadow-[inset_2px_0_0_var(--selection)]"
                      : hovered
                        ? "bg-muted/50"
                        : "hover:bg-muted/50",
                  )}
                >
                  <td className="px-3">{route.method}</td>
                  <td className="px-3 break-all">{route.pattern}</td>
                  <td
                    className="px-3 text-muted-foreground"
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
                      className="text-left break-all hover:text-foreground focus-visible:text-foreground focus-visible:underline"
                    >
                      {route.path}:{route.line}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {coverage !== null && coverage.omitted > 0 ? (
        <p className="border-t border-border px-3 py-1.5 text-muted-foreground">
          {coverage.omitted}{" "}
          {coverage.omitted === 1 ? "declaration is" : "declarations are"} not
          listed because the method or full path is not written out.
        </p>
      ) : null}
    </div>
  );
}
