import Link from "next/link";

import { AtlasMark } from "@/components/brand/mark";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function NotFound() {
  return (
    <main className="atlas-dot-well flex min-h-dvh items-center justify-center p-6">
      <div className="atlas-window w-full max-w-md rounded-2xl p-6">
        <div className="flex items-center gap-2.5">
          <span className="flex size-7 items-center justify-center rounded-lg bg-well shadow-2xs">
            <AtlasMark className="size-4" />
          </span>
          <span className="text-[13.5px] font-medium">CodeAtlas</span>
        </div>

        <p className="mt-4 font-mono text-[11px] text-muted-foreground">404</p>
        <h1 className="mt-1 text-[15px] font-medium tracking-[-0.01em] text-foreground">
          Page not found
        </h1>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
          This page or analysis does not exist, or you do not have access to it
          in your active workspace.
        </p>

        <div className="mt-5 flex items-center gap-2">
          <Link href="/dashboard" className={cn(buttonVariants({ size: "sm" }))}>
            Go to analyses
          </Link>
          <Link
            href="/"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Home
          </Link>
        </div>
      </div>
    </main>
  );
}
