"use client";

import { ArrowUpRight, Check, GitCommitHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

const ROUTE_ROWS = [
  {
    method: "POST",
    path: "/api/sessions/verify",
    handler: "app/api/sessions/verify/route.ts",
    tone: "text-outgoing bg-outgoing/12",
  },
  {
    method: "GET",
    path: "/api/workspaces/[slug]",
    handler: "app/api/workspaces/[slug]/route.ts",
    tone: "text-incoming bg-incoming/12",
  },
  {
    method: "PATCH",
    path: "/api/members/[id]/role",
    handler: "app/api/members/[id]/role/route.ts",
    tone: "text-selection bg-selection/12",
  },
  {
    method: "DELETE",
    path: "/api/tokens/[tokenId]",
    handler: "app/api/tokens/[tokenId]/route.ts",
    tone: "text-destructive bg-destructive/12",
  },
] as const;

const ROLE_FILTERS = [
  { id: "controllers", label: "Controllers", count: 14, color: "var(--kind-1)" },
  { id: "services", label: "Services", count: 22, color: "var(--kind-9)" },
  { id: "hooks", label: "Hooks", count: 9, color: "var(--kind-6)" },
  { id: "schemas", label: "Schemas", count: 11, color: "var(--kind-3)" },
  { id: "tests", label: "Tests", count: 18, color: "var(--kind-11)" },
] as const;

/**
 * StageShow ruled bento grid: five distinct tile kinds (Hero UI, Stat,
 * Interactive Component, Inverted Grounded-Ask, and Diagram) separated by 1px
 * hairlines with zero repeated data across tiles.
 */
export function AtlasBento() {
  const [hiddenRoles, setHiddenRoles] = useState<Set<string>>(
    () => new Set(["tests"]),
  );

  const toggleRole = (id: string) => {
    setHiddenRoles((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="grid gap-4 md:grid-cols-6">
      {/* Tile 1 (4 cols): Hero UI — edge-cropped static Route Table */}
      <article className="atlas-surface flex flex-col justify-between overflow-hidden rounded-2xl p-6 transition-shadow duration-150 hover:shadow-sm md:col-span-4">
        <div className="max-w-[44ch]">
          <p className="atlas-kicker">Route index</p>
          <h3 className="mt-2 text-[17px] font-medium tracking-[-0.02em]">
            Every provable endpoint, paired with its handler
          </h3>
          <p className="mt-1.5 text-[13px] leading-[1.6] text-muted-foreground">
            Extracted directly from path conventions and controller
            decorators. If the method or path is dynamic, it stays out of the
            table.
          </p>
        </div>

        {/* Edge-bleeding table frame */}
        <div className="mt-6 -mr-6 -mb-6 overflow-hidden rounded-tl-xl border-t border-l border-hairline bg-well/75 pt-3 pl-3">
          <div className="overflow-hidden rounded-tl-lg bg-raised shadow-xs">
            <div className="grid grid-cols-[64px_185px_minmax(220px,1fr)] border-b border-hairline bg-chrome/70 px-3 py-2 text-[11px] font-medium text-muted-foreground">
              <span>Method</span>
              <span>Path</span>
              <span>Handler file</span>
            </div>
            <ul className="divide-y divide-hairline">
              {ROUTE_ROWS.map((row) => (
                <li
                  key={row.path}
                  className="grid grid-cols-[64px_185px_minmax(220px,1fr)] items-center px-3 py-2.5 text-[12px] transition-colors hover:bg-foreground/[0.025]"
                >
                  <span>
                    <span
                      className={cn(
                        "text-trim inline-flex rounded-md px-1.5 py-0.5 font-mono text-[10px] font-medium",
                        row.tone,
                      )}
                    >
                      {row.method}
                    </span>
                  </span>
                  <span className="truncate pr-3 font-mono text-[11.5px] font-medium text-foreground">
                    {row.path}
                  </span>
                  <span className="truncate font-mono text-[11px] text-muted-foreground">
                    {row.handler}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </article>

      {/* Tile 2 (2 cols): Stat tile — animated honest coverage metric */}
      <CoverageTile />

      {/* Tile 3 (2 cols): Component tile — interactive role filter */}
      <article className="atlas-surface flex flex-col justify-between rounded-2xl p-6 transition-shadow duration-150 hover:shadow-sm md:col-span-2">
        <div>
          <p className="atlas-kicker">Focus controls</p>
          <h3 className="mt-2 text-[16px] font-medium tracking-[-0.02em]">
            Peel away noise by role
          </h3>
          <p className="mt-1.5 text-[12.5px] leading-[1.55] text-muted-foreground">
            Hide tests, configs, or any file kind with one click. Try toggling
            a layer below.
          </p>
        </div>

        <div className="mt-5 space-y-1 rounded-xl bg-well/75 p-2">
          {ROLE_FILTERS.map((role) => {
            const visible = !hiddenRoles.has(role.id);
            return (
              <button
                key={role.id}
                type="button"
                onClick={() => toggleRole(role.id)}
                className={cn(
                  "flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[12px] transition-colors",
                  visible
                    ? "bg-raised text-foreground shadow-2xs"
                    : "text-muted-foreground hover:bg-foreground/[0.04]",
                )}
              >
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      "size-2 rounded-full transition-opacity",
                      !visible && "opacity-30",
                    )}
                    style={{ backgroundColor: role.color }}
                  />
                  <span className={cn(!visible && "line-through opacity-65")}>
                    {role.label}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                    {role.count}
                  </span>
                  <span
                    className={cn(
                      "flex size-4 items-center justify-center rounded border transition-colors",
                      visible
                        ? "border-foreground/20 bg-primary text-primary-foreground"
                        : "border-hairline-strong bg-transparent text-transparent",
                    )}
                  >
                    <Check className="size-2.5" />
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </article>

      {/* Tile 4 (2 cols): Grounded Ask */}
      <article className="atlas-surface flex flex-col justify-between rounded-2xl p-6 transition-shadow duration-150 hover:shadow-sm md:col-span-2">
        <div>
          <p className="atlas-kicker">Grounded Ask</p>
          <h3 className="mt-2 text-[16px] font-medium tracking-[-0.02em]">
            Ask the graph, jump straight to the file
          </h3>
        </div>

        <div className="my-5 space-y-2.5 rounded-xl bg-well/75 p-3 ring-1 ring-inset ring-hairline">
          <div className="ml-auto w-fit max-w-[92%] rounded-xl rounded-br-sm bg-raised px-3 py-2 text-[12px] leading-snug text-foreground shadow-2xs ring-1 ring-inset ring-hairline">
            Where are invite tokens rotated?
          </div>
          <div className="rounded-xl rounded-bl-sm bg-surface p-3 text-[12px] leading-relaxed text-foreground/90 ring-1 ring-inset ring-hairline">
            <p>
              Rotation runs inside{" "}
              <span className="inline-flex items-center gap-0.5 rounded-md bg-selection/14 px-1.5 py-0.5 font-mono text-[10.5px] font-medium text-foreground ring-1 ring-inset ring-selection/25">
                auth/tokens.ts
                <ArrowUpRight className="size-2.5 text-selection" />
              </span>{" "}
              and invalidates active sessions through{" "}
              <span className="inline-flex items-center gap-0.5 rounded-md bg-selection/14 px-1.5 py-0.5 font-mono text-[10.5px] font-medium text-foreground ring-1 ring-inset ring-selection/25">
                store/sessions.ts
                <ArrowUpRight className="size-2.5 text-selection" />
              </span>
              .
            </p>
          </div>
        </div>

        <p className="text-[12.5px] leading-[1.55] text-muted-foreground">
          Every citation is a parsed path from the current snapshot—click any
          chip to focus it on the map.
        </p>
      </article>

      {/* Tile 5 (2 cols): Diagram tile — Commit-pinned snapshot */}
      <article className="atlas-surface flex flex-col justify-between rounded-2xl p-6 transition-shadow duration-150 hover:shadow-sm md:col-span-2">
        <div>
          <p className="atlas-kicker">Reproducible snapshot</p>
          <h3 className="mt-2 text-[16px] font-medium tracking-[-0.02em]">
            Pinned to an exact commit
          </h3>
          <p className="mt-1.5 text-[12.5px] leading-[1.55] text-muted-foreground">
            Cached explanations track the commit SHA and flag automatically
            whenever a newer run lands.
          </p>
        </div>

        <div className="atlas-dot-well mt-5 rounded-xl p-3.5 ring-1 ring-hairline">
          <div className="flex items-center justify-between text-[11px]">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-raised px-2 py-0.5 font-mono font-medium text-foreground shadow-2xs">
              <GitCommitHorizontal className="size-3 text-selection" />
              a91d3f4
            </span>
            <span className="font-mono text-[10.5px] text-muted-foreground">
              main · 42 files
            </span>
          </div>

          <div className="mt-3.5 space-y-1.5">
            <div className="flex items-center justify-between rounded-lg bg-raised px-2.5 py-1.5 text-[11px] shadow-2xs">
              <span className="font-mono text-foreground">telemetry/</span>
              <span className="font-mono text-[10px] text-incoming">
                6 in
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-raised px-2.5 py-1.5 text-[11px] shadow-2xs">
              <span className="font-mono text-foreground">workers/</span>
              <span className="font-mono text-[10px] text-outgoing">
                9 out
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-raised px-2.5 py-1.5 text-[11px] shadow-2xs">
              <span className="font-mono text-foreground">shared/</span>
              <span className="font-mono text-[10px] text-muted-foreground">
                14 in · 0 out
              </span>
            </div>
          </div>
        </div>
      </article>
    </div>
  );
}

const TARGET_COVERAGE = 98.6;
const TARGET_RESOLVED = 214;
const TARGET_UNRESOLVED = 3;
const COUNT_DURATION_MS = 1200;

function CoverageTile() {
  const cardRef = useRef<HTMLElement | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const node = cardRef.current;
    if (!node) {
      return;
    }

    let rafId: number | null = null;
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (reducedMotion) {
      rafId = requestAnimationFrame(() => setProgress(1));
      return () => {
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
        }
      };
    }

    const startAnimation = () => {
      const startedAt = performance.now();
      const step = (now: number) => {
        const elapsed = Math.min((now - startedAt) / COUNT_DURATION_MS, 1);
        const eased = 1 - Math.pow(1 - elapsed, 4);
        setProgress(eased);
        if (elapsed < 1) {
          rafId = requestAnimationFrame(step);
        }
      };
      rafId = requestAnimationFrame(step);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          startAnimation();
        }
      },
      { threshold: 0.35 },
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, []);

  const coverage = (TARGET_COVERAGE * progress).toFixed(1);
  const resolved = Math.round(TARGET_RESOLVED * progress);
  const unresolved = Math.round(TARGET_UNRESOLVED * progress);

  return (
    <article
      ref={cardRef}
      className="atlas-surface flex flex-col justify-between rounded-2xl p-6 transition-shadow duration-150 hover:shadow-sm md:col-span-2"
    >
      <div>
        <p className="atlas-kicker">Coverage</p>
        <h3 className="mt-2 text-[16px] font-medium tracking-[-0.02em]">
          Nothing hidden behind the graph
        </h3>
      </div>

      <div className="my-6">
        <p
          aria-label="98.6% imports resolved to files"
          className="font-mono text-[clamp(2.25rem,3.4vw,3rem)] leading-none font-medium tracking-[-0.04em] whitespace-nowrap tabular-nums"
        >
          <span aria-hidden="true">{coverage}%</span>
        </p>
        <p className="mt-2 text-[12px] text-muted-foreground">
          imports resolved to files
        </p>

        <div className="mt-4 flex h-1.5 w-full overflow-hidden rounded-full bg-well">
          <div
            className="h-full bg-incoming"
            style={{ width: `${94 * progress}%` }}
          />
          <div
            className="h-full bg-outgoing"
            style={{ width: `${6 * progress}%` }}
          />
        </div>

        <div className="mt-2.5 flex items-center justify-between font-mono text-[11px] text-muted-foreground tabular-nums">
          <span>{resolved} resolved</span>
          <span>{unresolved} unresolved</span>
        </div>
      </div>

      <p className="text-[12.5px] leading-[1.55] text-muted-foreground">
        Skipped binaries, ignored folders, and unresolved specifiers are
        surfaced in the workspace banner.
      </p>
    </article>
  );
}

