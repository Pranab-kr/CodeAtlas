"use client";

import { useOrganizationList } from "@clerk/nextjs";
import { useEffect, useRef, useState } from "react";

export function ActivateWorkspace({
  organizationId,
}: {
  organizationId: string;
}) {
  const { isLoaded, setActive } = useOrganizationList();
  const started = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!isLoaded || !setActive || started.current) {
      return;
    }

    started.current = true;

    void setActive({ organization: organizationId })
      .then(() => {
        window.location.replace("/");
      })
      .catch(() => {
        setFailed(true);
      });
  }, [isLoaded, organizationId, setActive]);

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm border border-border bg-surface p-4">
        <p className="text-[13px] font-medium">CodeAtlas</p>
        {failed ? (
          <>
            <p className="mt-2 text-[12px] text-muted-foreground">
              The organization could not be activated. Reload to try again.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-2 h-7 bg-accent px-2 text-[11px] text-accent-foreground focus-visible:outline-1 focus-visible:outline-offset-[-1px] focus-visible:outline-accent"
            >
              Reload
            </button>
          </>
        ) : (
          <p className="mt-2 font-mono text-[11px] text-muted-foreground">
            Setting up your workspace…
          </p>
        )}
      </div>
    </main>
  );
}
