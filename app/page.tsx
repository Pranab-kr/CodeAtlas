import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";

import { AtlasMark } from "@/components/brand/mark";
import { AnimatedGrid } from "@/components/marketing/animated-grid";
import { AtlasBento } from "@/components/marketing/atlas-bento";
import { HeroForm } from "@/components/marketing/hero-form";
import { HeroHeadline } from "@/components/marketing/hero-headline";
import {
  FolderFoldStage,
  HeroStage,
} from "@/components/marketing/hero-stage";
import { SiteHeader } from "@/components/site-header";
import { env } from "@/lib/env";
import { cn } from "@/lib/utils";

const SECTION_HEADING =
  "max-w-[20ch] text-[clamp(1.75rem,3.1vw,2.65rem)] leading-[1.08] font-medium tracking-[-0.036em] text-balance";

const STEPS = [
  {
    name: "Fetch",
    meta: "Immutable commit SHA",
    detail:
      "Resolve the latest commit, download the archive at that commit, and record the exact SHA.",
  },
  {
    name: "Select",
    meta: "Explicit coverage",
    detail:
      "Keep TypeScript and JavaScript files. Anything skipped is counted, so the map never looks more complete than it is.",
  },
  {
    name: "Parse",
    meta: "TypeScript AST",
    detail:
      "Read imports, re-exports, dynamic imports and require() with the TypeScript parser. Each resolves to a file or is reported unresolved.",
  },
  {
    name: "Fold",
    meta: "Deterministic layout",
    detail:
      "Starting at the deepest folder, merge small ones into their parent until the map fits. The same source always produces the same picture.",
  },
  {
    name: "Explain",
    meta: "Grounded prose",
    detail:
      "The model reads a file and the real neighbours handed to it. It can explain and answer questions; it cannot invent an edge.",
  },
] as const;

const FRAMEWORKS = [
  {
    order: "01",
    name: "Next.js",
    tag: "Routes & actions",
    detail:
      "Page and API routes from path conventions; server actions from the “use server” directive.",
  },
  {
    order: "02",
    name: "NestJS",
    tag: "Decorators & suffixes",
    detail:
      "Controllers, services, modules and entities from filename suffixes. Routes from controller and method decorators.",
  },
  {
    order: "03",
    name: "Express",
    tag: "Directory roles",
    detail:
      "Roles from directory convention, singular or plural. No route table, because Express assembles routes at runtime.",
  },
  {
    order: "04",
    name: "React",
    tag: "Hooks & JSX",
    detail:
      "Hooks from filenames, components from JSX, and tests and config from their paths.",
  },
  {
    order: "05",
    name: "Anything else",
    tag: "Universal fallback",
    detail:
      "Generic roles and an empty route table. The map still draws every import the parser can resolve.",
  },
] as const;

const LIMITS = [
  {
    lead: "Ask a model what depends on what.",
    detail:
      "Every box and line comes from parsing. The model explains the result and never decides that two files are connected.",
  },
  {
    lead: "Guess a missing edge.",
    detail:
      "An import that doesn't resolve is reported as unresolved, never drawn as an approximation.",
  },
  {
    lead: "Show a route it can't prove.",
    detail:
      "A route appears only when its method and full path are both recovered from the source. Otherwise it's absent.",
  },
  {
    lead: "Grade your code.",
    detail:
      "No scores, severity badges or issue counts. This explains a codebase; it doesn't review one.",
  },
] as const;

export default function LandingPage() {
  return (
    <>
      <SiteHeader signInUrl={env.clerkSignInUrl} />

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <AnimatedGrid />

          <div className="relative mx-auto w-full max-w-[1160px] px-6 pt-12 pb-20 md:pt-16 md:pb-24">
            <div className="mx-auto flex max-w-[46rem] flex-col items-center text-center">
              <div className="atlas-reveal mb-5 inline-flex items-center gap-2 rounded-full bg-surface/90 px-3 py-1 text-[11.5px] text-muted-foreground shadow-2xs [animation-delay:20ms]">
                <span className="size-1.5 rounded-full bg-incoming" />
                <span>Static AST dependency maps for TypeScript &amp; JavaScript</span>
              </div>

              <div className="flex justify-center">
                <HeroHeadline />
              </div>

              <p className="atlas-reveal mt-5 max-w-[50ch] text-[15px] leading-[1.68] text-muted-foreground [animation-delay:300ms]">
                Paste a public repository. CodeAtlas parses its imports and
                draws what depends on what. The model explains what the parser
                found; it never decides what&rsquo;s there.
              </p>

              <div className="atlas-reveal flex w-full justify-center [animation-delay:380ms]">
                <HeroForm />
              </div>

              <p className="atlas-reveal mt-3 text-[11.5px] leading-relaxed text-muted-foreground [animation-delay:440ms]">
                Public GitHub repositories. Sign in, then analysis starts immediately.
              </p>
            </div>

            <div className="atlas-reveal mt-12 md:mt-14 [animation-delay:240ms]">
              <HeroStage />
            </div>
          </div>
        </section>

        {/* Inside the workspace — StageShow ruled bento */}
        <Band id="inside" subtle>
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="atlas-kicker">Inside the workspace</p>
              <h2 className={cn(SECTION_HEADING, "mt-3")}>
                Built for reading unfamiliar codebases fast
              </h2>
            </div>
            <p className="max-w-[46ch] text-[14px] leading-[1.65] text-muted-foreground">
              Static routes, honest resolution stats, role filters, and grounded
              Q&amp;A share one commit-pinned workspace.
            </p>
          </div>

          <div className="mt-10">
            <AtlasBento />
          </div>
        </Band>

        {/* What it draws */}
        <Band id="what">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:items-center lg:gap-16">
            <div>
              <p className="atlas-kicker">Interactive folding</p>
              <h2 className={cn(SECTION_HEADING, "mt-3")}>What it draws</h2>
              <p className="mt-5 max-w-[46ch] text-[14.5px] leading-[1.7] text-muted-foreground">
                A folder becomes a box until you open it. Then its files appear
                as rows, and the edges move to the exact rows they touch. Select
                a file and its neighbours stay at full strength while everything
                else steps back.
              </p>

              <dl className="mt-8 grid max-w-[46ch] gap-2.5">
                <LegendCard
                  swatchClass="bg-outgoing"
                  term="Outgoing"
                  detail="Files this module imports directly"
                />
                <LegendCard
                  swatchClass="bg-incoming"
                  term="Incoming"
                  detail="Files that depend on this module"
                />
                <LegendCard
                  swatchClass="bg-[var(--edge)] opacity-55"
                  term="Background edge"
                  detail="Imports outside the selected file’s neighbourhood"
                />
              </dl>
            </div>

            <FolderFoldStage />
          </div>
        </Band>

        {/* How it works — ruled bento pipeline */}
        <Band id="how" subtle>
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="atlas-kicker">Pipeline</p>
              <h2 className={cn(SECTION_HEADING, "mt-3")}>How it works</h2>
            </div>
            <p className="max-w-[44ch] text-[14px] leading-[1.65] text-muted-foreground">
              A repository is fetched at one commit, parsed on disk, and stored
              before anything is drawn. Every stage can stop and say why.
            </p>
          </div>

          <ol className="mt-10 grid gap-3 md:grid-cols-6">
            {STEPS.map((step, index) => (
              <li
                key={step.name}
                className={cn(
                  "atlas-surface flex flex-col justify-between rounded-xl p-5 transition-shadow duration-150 hover:shadow-sm",
                  index < 3 ? "md:col-span-2" : "md:col-span-3",
                )}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center rounded-md bg-well px-2 py-0.5 font-mono text-[11px] font-medium text-foreground/80">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {step.meta}
                    </span>
                  </div>
                  <h3 className="mt-4 text-[15px] font-medium tracking-[-0.015em]">
                    {step.name}
                  </h3>
                  <p className="mt-2 text-[13px] leading-[1.62] text-muted-foreground">
                    {step.detail}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </Band>

        {/* Frameworks */}
        <Band id="frameworks">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="atlas-kicker">Adapters</p>
              <h2 className={cn(SECTION_HEADING, "mt-3")}>
                Which repositories it understands
              </h2>
            </div>
            <p className="max-w-[48ch] text-[14px] leading-[1.65] text-muted-foreground">
              Detection runs in a fixed order and the first match wins.
              Framework knowledge lives in an adapter, never in the parser, so
              the graph still works when nothing matches.
            </p>
          </div>

          <dl className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {FRAMEWORKS.map((framework) => (
              <div
                key={framework.name}
                className="atlas-surface flex flex-col justify-between rounded-xl p-4"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {framework.order}
                    </span>
                    <span className="rounded-full bg-well px-2 py-0.5 text-[10.5px] text-muted-foreground">
                      {framework.tag}
                    </span>
                  </div>
                  <dt className="mt-3.5 text-[14px] font-medium tracking-[-0.01em]">
                    {framework.name}
                  </dt>
                  <dd className="mt-2 text-[12.5px] leading-[1.6] text-muted-foreground">
                    {framework.detail}
                  </dd>
                </div>
              </div>
            ))}
          </dl>
        </Band>

        {/* Limits */}
        <Band id="limits" subtle>
          <div className="grid gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-14">
            <div className="flex flex-col justify-between">
              <div>
                <p className="atlas-kicker">Boundaries</p>
                <h2 className={cn(SECTION_HEADING, "mt-3")}>
                  What it deliberately doesn&rsquo;t do
                </h2>
                <p className="mt-5 max-w-[44ch] text-[14.5px] leading-[1.7] text-muted-foreground">
                  A map that is nearly right is worse than no map, because you
                  can&rsquo;t tell which part is wrong. These are the lines it
                  doesn&rsquo;t cross.
                </p>
              </div>

              <div className="atlas-surface mt-8 rounded-xl p-5 lg:mt-10">
                <p className="text-[clamp(1.35rem,2.2vw,1.95rem)] leading-[1.1] font-medium tracking-[-0.035em] text-balance">
                  Absent beats approximate.
                </p>
                <p className="mt-2 text-[12.5px] text-muted-foreground">
                  Unresolved imports and unprovable routes are surfaced honestly
                  instead of invented.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {LIMITS.map((limit) => (
                <div
                  key={limit.lead}
                  className="atlas-surface flex flex-col rounded-xl p-5"
                >
                  <span
                    aria-hidden="true"
                    className="inline-flex size-6 items-center justify-center rounded-md bg-well font-mono text-[12px] text-muted-foreground"
                  >
                    &times;
                  </span>
                  <h3 className="mt-4 text-[15px] leading-[1.3] font-medium tracking-[-0.02em] text-balance">
                    {limit.lead}
                  </h3>
                  <p className="mt-2 text-[13px] leading-[1.62] text-muted-foreground">
                    {limit.detail}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </Band>

        {/* Closing CTA */}
        <section className="border-t border-hairline">
          <div className="mx-auto w-full max-w-[1160px] px-6 py-20 md:py-24">
            <div className="atlas-window grid gap-10 rounded-2xl p-7 md:p-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.92fr)] lg:items-center lg:gap-14">
              <div>
                <h2 className={SECTION_HEADING}>Start with a repository.</h2>
                <p className="mt-4 max-w-[44ch] text-[14.5px] leading-[1.68] text-muted-foreground">
                  The map is drawn from the files at one commit. If an import
                  doesn&rsquo;t resolve, it&rsquo;s counted, not guessed.
                </p>
              </div>
              <div>
                <HeroForm
                  id="repository-url-bottom"
                  buttonLabel="Analyse"
                  compact
                />
                <p className="mt-3 text-[11.5px] leading-relaxed text-muted-foreground">
                  Public GitHub repositories. You&rsquo;ll sign in, then it
                  starts.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-hairline">
        <div className="mx-auto flex w-full max-w-[1160px] flex-col gap-5 px-6 py-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <AtlasMark className="size-4 text-muted-foreground" />
            <span className="text-[13px] font-medium">CodeAtlas</span>
            <span className="hidden text-[12px] text-muted-foreground sm:inline">
              · A dependency map drawn from the code itself.
            </span>
          </div>
          <nav
            aria-label="Footer"
            className="flex items-center gap-5 text-[12px] text-muted-foreground"
          >
            <a href="#what" className="transition-colors hover:text-foreground">
              What it draws
            </a>
            <a href="#how" className="transition-colors hover:text-foreground">
              How it works
            </a>
            <a href="#limits" className="transition-colors hover:text-foreground">
              Limits
            </a>
            <a
              href={env.clerkSignInUrl}
              className="inline-flex items-center gap-1 font-medium text-foreground transition-opacity hover:opacity-75"
            >
              Sign in
              <ArrowUpRight className="size-3" />
            </a>
          </nav>
        </div>
      </footer>
    </>
  );
}

function Band({
  id,
  subtle = false,
  children,
}: {
  id: string;
  subtle?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className={cn(
        "scroll-mt-14 border-t border-hairline",
        subtle && "bg-well/45",
      )}
    >
      <div className="mx-auto w-full max-w-[1160px] px-6 py-20 md:py-24">
        {children}
      </div>
    </section>
  );
}

function LegendCard({
  swatchClass,
  term,
  detail,
}: {
  swatchClass: string;
  term: string;
  detail: string;
}) {
  return (
    <div className="atlas-surface flex items-center gap-3 rounded-xl px-3.5 py-2.5">
      <span
        aria-hidden="true"
        className={cn("h-0.5 w-5 shrink-0 rounded-full", swatchClass)}
      />
      <dt className="min-w-[5.5rem] text-[12.5px] font-medium">{term}</dt>
      <dd className="text-[12.5px] text-muted-foreground">{detail}</dd>
    </div>
  );
}
