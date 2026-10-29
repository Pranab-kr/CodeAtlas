import type { ReactNode } from "react";

/**
 * The three columns are fixed here. Later phases fill the slots; they do not
 * rearrange them.
 */
export function WorkspaceShell({
  rail,
  map,
  detail,
}: {
  rail: ReactNode;
  map: ReactNode;
  detail: ReactNode;
}) {
  return (
    <div className="grid h-full min-h-0 grid-cols-[192px_minmax(0,1fr)_300px] overflow-hidden">
      <aside className="flex min-h-0 flex-col border-r border-border bg-muted/20">
        {rail}
      </aside>
      <section className="relative min-w-0 overflow-hidden bg-background">
        {map}
      </section>
      <aside
        aria-label="Detail"
        className="min-h-0 overflow-hidden border-l border-border bg-muted/10"
      >
        {detail}
      </aside>
    </div>
  );
}
