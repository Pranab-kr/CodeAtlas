"use client";

import { useEffect } from "react";

/**
 * A full document load, deliberately. The analysis page subscribes to live
 * stage updates, and a client-side navigation overlapping one of those updates
 * breaks the Flight client in Next 16.
 */
export function StartRedirect({ analysisId }: { analysisId: string }) {
  useEffect(() => {
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a full load keeps the live progress channel away from the Flight stream
    window.location.assign(`/analyses/${analysisId}`);
  }, [analysisId]);

  return (
    <p className="font-mono text-[11px] text-muted-foreground">
      Starting the analysis…
    </p>
  );
}
