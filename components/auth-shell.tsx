import Link from "next/link";
import type { ReactNode } from "react";

import { AtlasMark } from "@/components/brand/mark";
import { HeroFigure } from "@/components/marketing/figures";

const COPY = {
  "sign-in": {
    title: "The shape of a codebase, before you read it.",
    body: "Sign in to paste a public repository. Every box and line is parsed; the model only explains what the parser found.",
  },
  "sign-up": {
    title: "Map your first repository.",
    body: "Create an account to keep analyses in a workspace. The map is drawn from the source at one commit.",
  },
} as const;

/**
 * The auth pages are the landing page's compositions at rest: the same mark,
 * the same drawing, the same paper. The form is Clerk's; only the frame is
 * ours.
 */
export function AuthShell({
  mode,
  children,
}: {
  mode: keyof typeof COPY;
  children: ReactNode;
}) {
  const copy = COPY[mode];

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden border-r border-border bg-muted/25 p-10 lg:flex lg:flex-col">
        <Link
          href="/"
          className="flex w-fit items-center gap-2 text-[13px] font-medium tracking-tight"
          aria-label="CodeAtlas home"
        >
          <AtlasMark className="size-[18px]" />
          CodeAtlas
        </Link>

        <div className="my-auto max-w-[27rem] py-12">
          <h1 className="text-[clamp(2rem,2.6vw,2.7rem)] leading-[1.04] font-medium tracking-[-0.04em] text-balance">
            {copy.title}
          </h1>
          <p className="mt-4 max-w-[42ch] text-[14px] leading-[1.65] text-muted-foreground">
            {copy.body}
          </p>
          <HeroFigure className="mt-10 w-full" />
          <p className="mt-6 font-mono text-[10px] text-muted-foreground">
            Public GitHub / TypeScript and JavaScript
          </p>
        </div>
      </aside>

      <main className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-background px-6 py-10">
        <Link
          href="/"
          className="flex items-center gap-2 text-[13px] font-medium tracking-tight lg:hidden"
          aria-label="CodeAtlas home"
        >
          <AtlasMark className="size-[18px]" />
          CodeAtlas
        </Link>

        {children}

        <Link
          href="/"
          className="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        >
          Back to the landing page
        </Link>
      </main>
    </div>
  );
}
