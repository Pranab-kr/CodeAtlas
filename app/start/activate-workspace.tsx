"use client";

import { useOrganizationList } from "@clerk/nextjs";
import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AtlasMark } from "@/components/brand/mark";
import { Button } from "@/components/ui/button";

export function ActivateWorkspace({
  organizationId,
  next,
}: {
  organizationId: string;
  next: string;
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
        window.location.replace(next);
      })
      .catch(() => {
        setFailed(true);
      });
  }, [isLoaded, organizationId, next, setActive]);

  return (
    <main className="atlas-dot-well flex min-h-dvh items-center justify-center p-6">
      <div className="atlas-window w-full max-w-sm rounded-2xl p-5">
        <div className="flex items-center gap-2.5">
          <span className="flex size-7 items-center justify-center rounded-lg bg-well shadow-2xs">
            <AtlasMark className="size-4" />
          </span>
          <span className="text-[13.5px] font-medium">CodeAtlas</span>
        </div>

        <div className="mt-4">
          {failed ? (
            <>
              <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                The workspace could not be activated. Reload to try again.
              </p>
              <Button
                type="button"
                size="sm"
                className="mt-3"
                onClick={() => window.location.reload()}
              >
                Reload
              </Button>
            </>
          ) : (
            <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              <span>Setting up your workspace…</span>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
