"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { AtlasMark } from "@/components/brand/mark";
import { ModeToggle } from "@/components/mode-toggle";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LINKS = [
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
        "sticky top-0 z-40 border-b bg-background transition-[border-color] duration-200",
        scrolled ? "border-border" : "border-transparent",
      )}
    >
      <div className="mx-auto flex h-14 w-full max-w-[1140px] items-center gap-8 px-6">
        <Link
          href="/"
          className="group flex shrink-0 items-center gap-2 text-[13px] font-medium tracking-tight"
          aria-label="CodeAtlas home"
        >
          <AtlasMark className="size-[18px] transition-opacity duration-200 group-hover:opacity-60" />
          CodeAtlas
        </Link>

        <nav
          aria-label="Sections"
          className="hidden items-center gap-6 text-[12px] text-muted-foreground md:flex"
        >
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="relative py-1 transition-colors after:absolute after:inset-x-0 after:-bottom-0.5 after:h-px after:origin-left after:scale-x-0 after:bg-foreground after:transition-transform after:duration-200 hover:text-foreground hover:after:scale-x-100 focus-visible:text-foreground focus-visible:after:scale-x-100"
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
              className: "border-border",
            })}
          >
            Sign in
          </a>
        </div>
      </div>
    </header>
  );
}
