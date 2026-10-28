import { Suspense } from "react";
import { requireActiveOrganization } from "@/lib/active-org";

async function WorkspaceDetails() {
  const { name, orgId, orgRole } = await requireActiveOrganization();

  return (
    <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 font-mono text-[11px]">
      <dt className="text-muted-foreground">organization</dt>
      <dd className="truncate">{name}</dd>
      <dt className="text-muted-foreground">role</dt>
      <dd>{orgRole ?? "none"}</dd>
      <dt className="text-muted-foreground">id</dt>
      <dd className="truncate">{orgId}</dd>
    </dl>
  );
}

export default function Home() {
  return (
    <section className="h-full overflow-auto p-4">
      <div className="max-w-xl">
        <h1 className="text-[13px] font-medium">Workspace</h1>
        <p className="mt-1 max-w-md text-[12px] text-muted-foreground">
          Analyses belong to the organization below. Nothing has been mapped
          yet.
        </p>
        <div className="mt-4 border border-border bg-surface p-3">
          <Suspense
            fallback={
              <p className="font-mono text-[11px] text-muted-foreground">
                Reading session…
              </p>
            }
          >
            <WorkspaceDetails />
          </Suspense>
        </div>
      </div>
    </section>
  );
}
