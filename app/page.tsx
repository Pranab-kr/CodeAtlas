import type { ReactNode } from "react";

import { AtlasMark } from "@/components/brand/mark";
import {
  FolderFigure,
  HeroFigure,
} from "@/components/marketing/figures";
import { Figure } from "@/components/marketing/figure-frame";
import { AnimatedGrid } from "@/components/marketing/animated-grid";
import { HeroForm } from "@/components/marketing/hero-form";
import { HeroHeadline } from "@/components/marketing/hero-headline";
import { SiteHeader } from "@/components/site-header";
import { env } from "@/lib/env";
import { cn } from "@/lib/utils";

const SECTION_HEADING =
  "max-w-[18ch] text-[clamp(1.9rem,3.4vw,2.9rem)] leading-[1.06] font-medium tracking-[-0.035em] text-balance";

const STEPS = [
  {
    name: "Fetch",
    detail:
      "Resolve the latest commit, download the archive at that commit, and record the SHA.",
  },
  {
    name: "Select",
    detail:
      "Keep TypeScript and JavaScript files. Anything skipped is counted, so the map never looks more complete than it is.",
  },
  {
    name: "Parse",
    detail:
      "Read imports, re-exports, dynamic imports and require() with the TypeScript parser. Each one resolves to a file or is reported unresolved.",
  },
  {
    name: "Fold",
    detail:
      "Starting at the deepest folder, merge small ones into their parent until the map fits. The same data always produces the same picture.",
  },
  {
    name: "Explain",
    detail:
      "The model reads a file and the real neighbours handed to it. It can explain and label; it cannot add an edge or walk the graph.",
  },
] as const;

const FRAMEWORKS = [
  {
    name: "Next.js",
    detail:
      "Page and API routes from path conventions; server actions from the \u201cuse server\u201d directive.",
  },
  {
    name: "NestJS",
    detail:
      "Controllers, services, modules and entities from filename suffixes. Routes from decorators on the controller and the method.",
  },
  {
    name: "Express",
    detail:
      "Roles from directory convention, singular or plural. No route table, because Express assembles routes at runtime.",
  },
  {
    name: "React",
    detail:
      "Hooks from filenames, components from JSX, and tests and config from their paths.",
  },
  {
    name: "Anything else",
    detail:
      "Generic roles and an empty route table. The map still draws every import it can resolve.",
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
        <section className="relative overflow-hidden">
          <AnimatedGrid />

          <div className="relative mx-auto grid w-full max-w-[1140px] gap-16 px-6 pt-16 pb-24 lg:min-h-[calc(100svh-3.5rem)] lg:grid-cols-[minmax(0,1.02fr)_minmax(0,1fr)] lg:items-center lg:gap-20 lg:pt-20 lg:pb-24">
            <div>
              <HeroHeadline />

              <p className="atlas-reveal mt-7 max-w-[46ch] text-[15px] leading-[1.7] text-muted-foreground [animation-delay:360ms]">
                Paste a public repository. CodeAtlas parses its imports and
                draws what depends on what. The model explains what the parser
                found; it never decides what&rsquo;s there.
              </p>

              <div className="atlas-reveal [animation-delay:440ms]">
                <HeroForm />
              </div>

              <p className="atlas-reveal mt-3 text-[11.5px] leading-relaxed text-muted-foreground [animation-delay:520ms]">
                Public GitHub repositories. You&rsquo;ll sign in, then it
                starts.
              </p>
            </div>

            <Figure
              className="w-full max-w-[600px] justify-self-center lg:justify-self-end"
              caption="fig. 01 / imports resolved to files, folded by folder"
              delay="280ms"
            >
              <HeroFigure className="w-full" />
            </Figure>
          </div>
        </section>

        <Band id="what">
          <div className="grid gap-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center lg:gap-20">
            <div>
              <h2 className={SECTION_HEADING}>What it draws</h2>
              <p className="mt-6 max-w-[46ch] text-[15px] leading-[1.7] text-muted-foreground">
                A folder becomes a box until you open it. Then its files appear
                as rows, and the edges move to the rows they actually touch.
                Select a file and its neighbours stay at full strength while
                the rest steps back.
              </p>
              <dl className="mt-10 max-w-[46ch] space-y-3 border-t border-border pt-6">
                <LegendLine
                  className="bg-outgoing"
                  term="outgoing"
                  detail="what this file depends on"
                />
                <LegendLine
                  className="bg-incoming"
                  term="incoming"
                  detail="what depends on this file"
                />
                <LegendLine
                  className="bg-[var(--edge)] opacity-40"
                  term="edge"
                  detail="an import outside the selected file"
                />
              </dl>
            </div>

            <Figure
              className="w-full max-w-[600px] justify-self-center lg:justify-self-end"
              caption="fig. 02 / edges move to the rows they touch"
              delay="60ms"
            >
              <FolderFigure className="w-full" />
            </Figure>
          </div>
        </Band>

        <Band id="how">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-20">
            <div className="lg:sticky lg:top-24 lg:self-start">
              <h2 className={SECTION_HEADING}>How it works</h2>
              <p className="mt-6 max-w-[46ch] text-[15px] leading-[1.7] text-muted-foreground">
                A repository is fetched at one commit, parsed on disk, and
                stored before anything is drawn. Every step can stop and say
                why.
              </p>
            </div>

            <ol className="border-t border-border">
              {STEPS.map((step, index) => (
                <li
                  key={step.name}
                  className="group -mx-2 grid grid-cols-[2.5rem_1fr] gap-4 border-b border-border px-2 py-5 transition-colors hover:bg-muted/25"
                >
                  <span className="font-mono text-[11px] text-muted-foreground transition-colors group-hover:text-foreground">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h3 className="text-[13px] font-medium">{step.name}</h3>
                    <p className="mt-1 max-w-[46ch] text-[13px] leading-[1.6] text-muted-foreground">
                      {step.detail}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </Band>

        <Band id="frameworks">
          <h2 className={SECTION_HEADING}>Which repositories it understands</h2>
          <p className="mt-6 max-w-[64ch] text-[15px] leading-[1.7] text-muted-foreground">
            Detection runs in a fixed order &mdash; Next.js, NestJS, Express,
            React &mdash; and the first match wins. Framework knowledge lives
            in an adapter, never in the parser, so the map still works when
            nothing matches.
          </p>
          <dl className="mt-14 border-t border-border">
            {FRAMEWORKS.map((framework) => (
              <div
                key={framework.name}
                className="group -mx-2 grid gap-2 border-b border-border px-2 py-5 transition-colors hover:bg-muted/25 sm:grid-cols-[12rem_1fr] sm:gap-20"
              >
                <dt className="text-[13px] font-medium">{framework.name}</dt>
                <dd className="max-w-[64ch] text-[13px] leading-[1.6] text-muted-foreground">
                  {framework.detail}
                </dd>
              </div>
            ))}
          </dl>
        </Band>

        <Band id="limits">
          <div className="grid gap-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-20">
            <div>
              <h2 className={SECTION_HEADING}>
                What it deliberately doesn&rsquo;t do
              </h2>
              <p className="mt-6 max-w-[46ch] text-[15px] leading-[1.7] text-muted-foreground">
                A map that is nearly right is worse than no map, because you
                can&rsquo;t tell which part is wrong. These are the lines it
                doesn&rsquo;t cross.
              </p>
              <p className="mt-12 max-w-[14ch] border-t border-border pt-6 text-[clamp(1.7rem,2.6vw,2.4rem)] leading-[1.04] font-medium tracking-[-0.04em] text-balance">
                Absent beats approximate.
              </p>
            </div>

            <div className="border-t border-border">
              {LIMITS.map((limit) => (
                <div
                  key={limit.lead}
                  className="group grid grid-cols-[1.25rem_1fr] gap-4 border-b border-border py-6"
                >
                  <span
                    aria-hidden="true"
                    className="pt-1 font-mono text-[13px] leading-none text-muted-foreground/60 transition-colors group-hover:text-muted-foreground"
                  >
                    &times;
                  </span>
                  <div>
                    <h3 className="max-w-[46ch] text-[clamp(1.2rem,1.9vw,1.55rem)] leading-[1.2] font-medium tracking-[-0.02em] text-balance">
                      {limit.lead}
                    </h3>
                    <p className="mt-2 max-w-[64ch] text-[14px] leading-[1.65] text-muted-foreground">
                      {limit.detail}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Band>

        <section className="border-t border-border">
          <div className="mx-auto grid w-full max-w-[1140px] gap-12 px-6 py-24 md:py-28 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] lg:items-end lg:gap-20">
            <div>
              <h2 className={SECTION_HEADING}>Start with a repository.</h2>
              <p className="mt-6 max-w-[46ch] text-[15px] leading-[1.7] text-muted-foreground">
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
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-[1140px] flex-col gap-6 px-6 py-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <AtlasMark className="size-4 text-muted-foreground" />
            <span className="text-[13px] font-medium">CodeAtlas</span>
            <span className="hidden text-[11.5px] text-muted-foreground sm:inline">
              A dependency map drawn from the code itself.
            </span>
          </div>
          <nav
            aria-label="Footer"
            className="flex items-center gap-5 text-[11.5px] text-muted-foreground"
          >
            <a href="#what" className="transition-colors hover:text-foreground">
              What it draws
            </a>
            <a href="#limits" className="transition-colors hover:text-foreground">
              Limits
            </a>
            <a
              href={env.clerkSignInUrl}
              className="transition-colors hover:text-foreground"
            >
              Sign in
            </a>
          </nav>
        </div>
      </footer>
    </>
  );
}

function Band({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-14 border-t border-border">
      <div className="mx-auto w-full max-w-[1140px] px-6 py-24 md:py-32">
        {children}
      </div>
    </section>
  );
}

function LegendLine({
  className,
  term,
  detail,
}: {
  className: string;
  term: string;
  detail: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span aria-hidden="true" className={cn("h-px w-6 shrink-0", className)} />
      <dt className="text-[12px] font-medium">{term}</dt>
      <dd className="text-[12px] text-muted-foreground">{detail}</dd>
    </div>
  );
}
