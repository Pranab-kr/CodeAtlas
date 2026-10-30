import Link from "next/link";

import { ModeToggle } from "@/components/mode-toggle";
import {
  FolderFigure,
  HeroFigure,
} from "@/components/marketing/figures";
import { HeroForm } from "@/components/marketing/hero-form";
import { buttonVariants } from "@/components/ui/button";
import { env } from "@/lib/env";

const SECTION_HEADING =
  "max-w-[18ch] text-[clamp(1.9rem,3.4vw,2.9rem)] leading-[1.08] font-medium tracking-[-0.035em] text-balance";

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
      <header className="sticky top-0 z-40 border-b border-border bg-background">
        <div className="mx-auto flex h-14 w-full max-w-[1140px] items-center px-6">
          <Link href="/" className="text-[13px] font-medium tracking-tight">
            CodeAtlas
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <ModeToggle />
            <a
              href={env.clerkSignInUrl}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Sign in
            </a>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto grid w-full max-w-[1140px] gap-16 px-6 pt-20 pb-24 lg:min-h-[calc(100svh-3.5rem)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)] lg:items-center lg:gap-20 lg:pt-24 lg:pb-28">
          <div>
            <h1 className="text-[clamp(2.6rem,5.2vw,4.6rem)] leading-[1.05] font-medium tracking-[-0.045em] text-balance">
              The shape of a codebase, drawn from the source.
            </h1>
            <p className="mt-7 max-w-[46ch] text-[15px] leading-[1.65] text-muted-foreground">
              Paste a public repository. CodeAtlas parses its imports and draws
              what depends on what. The model explains what the parser found; it
              never decides what&rsquo;s there.
            </p>
            <HeroForm />
            <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
              Public GitHub repositories. You&rsquo;ll sign in, then it starts.
            </p>
          </div>
          <HeroFigure className="w-full max-w-[620px] justify-self-center lg:justify-self-end" />
        </section>

        <section className="border-t border-border">
          <div className="mx-auto w-full max-w-[1140px] px-6 py-24 md:py-32">
            <div className="grid gap-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center lg:gap-20">
              <div>
                <h2 className={SECTION_HEADING}>What it draws</h2>
                <p className="mt-6 max-w-[46ch] text-[15px] leading-[1.65] text-muted-foreground">
                  A folder becomes a box until you open it. Then its files appear
                  as rows, and the edges move to the rows they actually touch.
                  Select a file and its neighbours stay at full strength while
                  the rest steps back.
                </p>
                <dl className="mt-10 max-w-[46ch] space-y-3 border-t border-border pt-6">
                  <div className="flex items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="h-px w-6 shrink-0 bg-outgoing"
                    />
                    <dt className="text-[12px] font-medium">outgoing</dt>
                    <dd className="text-[12px] text-muted-foreground">
                      what this file depends on
                    </dd>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="h-px w-6 shrink-0 bg-incoming"
                    />
                    <dt className="text-[12px] font-medium">incoming</dt>
                    <dd className="text-[12px] text-muted-foreground">
                      what depends on this file
                    </dd>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="h-px w-6 shrink-0 bg-[var(--edge)] opacity-40"
                    />
                    <dt className="text-[12px] font-medium">edge</dt>
                    <dd className="text-[12px] text-muted-foreground">
                      an import outside the selected file
                    </dd>
                  </div>
                </dl>
              </div>
              <FolderFigure className="w-full max-w-[600px] justify-self-center lg:justify-self-end" />
            </div>
          </div>
        </section>

        <section className="border-t border-border">
          <div className="mx-auto w-full max-w-[1140px] px-6 py-24 md:py-32">
            <div className="grid gap-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-20">
              <div>
                <h2 className={SECTION_HEADING}>How it works</h2>
                <p className="mt-6 max-w-[46ch] text-[15px] leading-[1.65] text-muted-foreground">
                  A repository is fetched at one commit, parsed on disk, and
                  stored before anything is drawn. Every step can stop and say
                  why.
                </p>
              </div>
              <ol className="border-t border-border">
                {STEPS.map((step, index) => (
                  <li
                    key={step.name}
                    className="grid grid-cols-[2.5rem_1fr] gap-4 border-b border-border py-5"
                  >
                    <span className="font-mono text-[11px] text-muted-foreground">
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
          </div>
        </section>

        <section className="border-t border-border">
          <div className="mx-auto w-full max-w-[1140px] px-6 py-24 md:py-32">
            <h2 className={SECTION_HEADING}>
              Which repositories it understands
            </h2>
            <p className="mt-6 max-w-[64ch] text-[15px] leading-[1.65] text-muted-foreground">
              Detection runs in a fixed order &mdash; Next.js, NestJS, Express,
              React &mdash; and the first match wins. Framework knowledge lives
              in an adapter, never in the parser, so the map still works when
              nothing matches.
            </p>
            <dl className="mt-14 border-t border-border">
              {FRAMEWORKS.map((framework) => (
                <div
                  key={framework.name}
                  className="grid gap-2 border-b border-border py-5 sm:grid-cols-[12rem_1fr] sm:gap-20"
                >
                  <dt className="text-[13px] font-medium">
                    {framework.name}
                  </dt>
                  <dd className="max-w-[64ch] text-[13px] leading-[1.6] text-muted-foreground">
                    {framework.detail}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="border-t border-border">
          <div className="mx-auto w-full max-w-[1140px] px-6 py-24 md:py-32">
            <div className="grid gap-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-20">
              <div>
                <h2 className={SECTION_HEADING}>
                  What it deliberately doesn&rsquo;t do
                </h2>
                <p className="mt-6 max-w-[46ch] text-[15px] leading-[1.65] text-muted-foreground">
                  A map that is nearly right is worse than no map, because you
                  can&rsquo;t tell which part is wrong. These are the lines it
                  doesn&rsquo;t cross.
                </p>
              </div>
              <div className="border-t border-border">
                {LIMITS.map((limit) => (
                  <div
                    key={limit.lead}
                    className="border-b border-border py-6"
                  >
                    <h3 className="max-w-[46ch] text-[clamp(1.2rem,1.9vw,1.55rem)] leading-[1.2] font-medium tracking-[-0.02em] text-balance">
                      {limit.lead}
                    </h3>
                    <p className="mt-2 max-w-[64ch] text-[14px] leading-[1.65] text-muted-foreground">
                      {limit.detail}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-[1140px] flex-col gap-2 px-6 py-8 sm:flex-row sm:items-baseline sm:justify-between">
          <span className="text-[13px] font-medium">CodeAtlas</span>
          <p className="max-w-[64ch] text-[12px] text-muted-foreground">
            A dependency map of a codebase, drawn from the code itself.
          </p>
        </div>
      </footer>
    </>
  );
}
