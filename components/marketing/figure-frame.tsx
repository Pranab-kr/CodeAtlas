import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The illustrations are drawings, so they are presented as plates: a hairline
 * frame with registration ticks and a caption that names the figure. The
 * drawing itself stays unlabelled.
 */
export function Figure({
  caption,
  children,
  className,
  delay = "220ms",
}: {
  caption: string;
  children: ReactNode;
  className?: string;
  delay?: string;
}) {
  return (
    <figure
      className={cn("atlas-reveal", className)}
      style={{ animationDelay: delay }}
    >
      <div className="relative border border-border bg-background p-3 sm:p-4">
        <Corner className="-top-px -left-px border-t border-l" />
        <Corner className="-top-px -right-px border-t border-r" />
        <Corner className="-bottom-px -left-px border-b border-l" />
        <Corner className="-right-px -bottom-px border-r border-b" />
        {children}
      </div>
      <figcaption className="mt-3 flex items-center gap-2 font-mono text-[10px] leading-none text-muted-foreground">
        <span aria-hidden="true" className="h-px w-5 shrink-0 bg-border" />
        {caption}
      </figcaption>
    </figure>
  );
}

function Corner({ className }: { className: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute size-2 border-foreground/35",
        className,
      )}
    />
  );
}
