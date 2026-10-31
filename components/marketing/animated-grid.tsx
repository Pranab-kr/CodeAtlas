import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";

/**
 * A graph-paper backdrop for the hero. Adapted from the CSS-only AnimatedGrid
 * by rmahammad on 21st.dev: two line grids, a slow drift, a radial mask, no
 * canvas and no JavaScript loop. The line colour is the border token, so the
 * page still has no colour of its own.
 */
export function AnimatedGrid({
  size = 32,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "atlas-grid pointer-events-none absolute inset-0 overflow-hidden",
        className,
      )}
      style={
        {
          "--grid-size": `${size}px`,
          "--grid-major": `${size * 4}px`,
        } as CSSProperties
      }
    />
  );
}
