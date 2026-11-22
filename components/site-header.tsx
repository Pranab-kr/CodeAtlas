"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { AtlasMark } from "@/components/brand/mark";
import { ModeToggle } from "@/components/mode-toggle";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "#inside", label: "Workspace" },
  { href: "#what", label: "What it draws" },
  { href: "#how", label: "How it works" },
  { href: "#frameworks", label: "Frameworks" },
  { href: "#limits", label: "Limits" },
] as const;

export function SiteHeader({ signInUrl }: { signInUrl: string }) {
  const [scrolled, setScrolled] = useState(false);

  // The rule appears once the page has moved, so the hero starts without a
  // line cutting across the top of it.
  useEffect(() => {
    const settle = () => setScrolled(window.scrollY > 8);
    settle();
    window.addEventListener("scroll", settle, { passive: true });
    return () => window.removeEventListener("scroll", settle);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b transition-[border-color,background-color,backdrop-filter] duration-200",
        scrolled
          ? "border-hairline bg-background/85 backdrop-blur-md"
          : "border-transparent bg-transparent",
      )}
    >
      <div className="mx-auto flex h-14 w-full max-w-[1160px] items-center gap-8 px-6">
        <Link
          href="/"
          className="group flex shrink-0 items-center gap-2 text-[13.5px] font-medium tracking-[-0.015em]"
          aria-label="CodeAtlas home"
        >
          <span className="flex size-7 items-center justify-center rounded-lg bg-surface shadow-2xs transition-transform duration-150 group-hover:scale-[1.03]">
            <AtlasMark className="size-4" />
          </span>
          <span>CodeAtlas</span>
        </Link>

        <nav
          aria-label="Sections"
          className="hidden items-center gap-1 text-[12.5px] text-muted-foreground md:flex"
        >
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-lg px-2.5 py-1.5 transition-colors hover:bg-foreground/[0.05] hover:text-foreground focus-visible:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <ModeToggle />
          <a
            href={signInUrl}
            className={buttonVariants({
              variant: "outline",
              size: "sm",
              className: "px-3",
            })}
          >
            Sign in
          </a>
        </div>
      </div>
    </header>
  );
}
