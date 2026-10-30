"use client";

import { useOrganizationList } from "@clerk/nextjs";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
    <main className="flex min-h-dvh items-center justify-center p-6">
      <Card className="w-full max-w-sm gap-0 py-0">
        <CardHeader className="px-4 pt-4">
          <CardTitle className="text-[13px]">CodeAtlas</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {failed ? (
            <>
              <p className="text-[12px] text-muted-foreground">
                The organization could not be activated. Reload to try again.
              </p>
              <Button
                type="button"
                size="xs"
                className="mt-2"
                onClick={() => window.location.reload()}
              >
                Reload
              </Button>
            </>
          ) : (
            <p className="mt-2 font-mono text-[11px] text-muted-foreground">
              Setting up your workspace…
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
