import Link from "next/link";
import type { ReactNode } from "react";

import { AtlasMark } from "@/components/brand/mark";

/**
 * Centered auth canvas sharing the landing page's mark and warm paper dot-well
 * backdrop. The form is Clerk's; only the surrounding frame is ours.
 */
export function AuthShell({
  mode,
  children,
}: {
  mode: "sign-in" | "sign-up";
  children: ReactNode;
}) {
  return (
    <main
      data-auth-mode={mode}
      className="atlas-dot-well flex min-h-dvh flex-col items-center justify-center gap-6 px-6 py-12"
    >
      <Link
        href="/"
        className="flex items-center gap-2 text-[14px] font-medium tracking-[-0.015em] text-foreground transition-opacity hover:opacity-80"
        aria-label="CodeAtlas home"
      >
        <span className="flex size-7 items-center justify-center rounded-lg bg-surface shadow-2xs">
          <AtlasMark className="size-4" />
        </span>
        CodeAtlas
      </Link>

      {children}

      <Link
        href="/"
        className="text-[12px] text-muted-foreground transition-colors hover:text-foreground"
      >
        Back to the landing page
      </Link>
    </main>
  );
}
