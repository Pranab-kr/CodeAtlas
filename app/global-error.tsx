"use client";

import { useEffect } from "react";

import { AtlasMark } from "@/components/brand/mark";
import { Button } from "@/components/ui/button";
import "./globals.css";

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error("[app] unhandled global error", error);
  }, [error]);

  return (
    <html lang="en" className="h-full">
      <body className="min-h-dvh bg-background text-foreground antialiased">
        <main className="atlas-dot-well flex min-h-dvh items-center justify-center p-6">
          <div className="atlas-window w-full max-w-md rounded-2xl p-6">
            <div className="flex items-center gap-2.5">
              <span className="flex size-7 items-center justify-center rounded-lg bg-well shadow-2xs">
                <AtlasMark className="size-4" />
              </span>
              <span className="text-[13.5px] font-medium">CodeAtlas</span>
            </div>

            <h1 className="mt-4 text-[15px] font-medium tracking-[-0.01em] text-foreground">
              Application error
            </h1>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
              CodeAtlas ran into a problem while rendering this page. Reload or
              return home to continue.
            </p>

            {error.digest ? (
              <p className="mt-3 font-mono text-[11px] text-muted-foreground">
                Reference: {error.digest}
              </p>
            ) : null}

            <div className="mt-5 flex items-center gap-2">
              <Button type="button" size="sm" onClick={reset}>
                Try again
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  // Full reload: RootLayout has crashed so Next's client router may be unavailable.
                  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
                  window.location.assign("/");
                }}
              >
                Home
              </Button>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
