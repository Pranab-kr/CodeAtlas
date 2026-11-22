"use client";

import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  GitCommitHorizontal,
  Map as MapIcon,
  MessageSquare,
  Route,
} from "lucide-react";
import { useState } from "react";

import { AtlasMark } from "@/components/brand/mark";
import { cn } from "@/lib/utils";

type FileId =
  | "routes/checkout.ts"
  | "routes/webhooks.ts"
  | "services/billing.ts"
  | "services/invoices.ts"
  | "lib/stripe.ts"
  | "db/orders.ts";

interface DemoFile {
  id: FileId;
  folder: string;
  name: string;
  role: string;
  kindColor: string;
  summary: string;
  incoming: FileId[];
  outgoing: FileId[];
}

const DEMO_FILES: Record<FileId, DemoFile> = {
  "routes/checkout.ts": {
    id: "routes/checkout.ts",
    folder: "routes",
    name: "checkout.ts",
    role: "Route",
    kindColor: "var(--kind-1)",
    summary:
      "Validates cart payload, creates a checkout session through services/billing.ts, and persists the pending order.",
    incoming: [],
    outgoing: ["services/billing.ts", "db/orders.ts"],
  },
  "routes/webhooks.ts": {
    id: "routes/webhooks.ts",
    folder: "routes",
    name: "webhooks.ts",
    role: "Route",
    kindColor: "var(--kind-1)",
    summary:
      "Verifies Stripe webhook signatures and forwards paid events to services/billing.ts and services/invoices.ts.",
    incoming: [],
    outgoing: ["services/billing.ts", "services/invoices.ts"],
  },
  "services/billing.ts": {
    id: "services/billing.ts",
    folder: "services",
    name: "billing.ts",
    role: "Service",
    kindColor: "var(--kind-9)",
    summary:
      "Coordinates checkout creation and webhook settlement. Delegates payment intents to lib/stripe.ts and records state in db/orders.ts.",
    incoming: ["routes/checkout.ts", "routes/webhooks.ts"],
    outgoing: ["lib/stripe.ts", "db/orders.ts"],
  },
  "services/invoices.ts": {
    id: "services/invoices.ts",
    folder: "services",
    name: "invoices.ts",
    role: "Service",
    kindColor: "var(--kind-9)",
    summary:
      "Generates PDF receipts after settlement and updates invoice numbers on the matching order row.",
    incoming: ["routes/webhooks.ts"],
    outgoing: ["db/orders.ts"],
  },
  "lib/stripe.ts": {
    id: "lib/stripe.ts",
    folder: "lib",
    name: "stripe.ts",
    role: "Client",
    kindColor: "var(--kind-6)",
    summary:
      "Thin typed wrapper over the Stripe SDK. Holds retry configuration and idempotency key helpers.",
    incoming: ["services/billing.ts"],
    outgoing: [],
  },
  "db/orders.ts": {
    id: "db/orders.ts",
    folder: "db",
    name: "orders.ts",
    role: "Data",
    kindColor: "var(--kind-3)",
    summary:
      "Typed SQL queries for creating, locking, and marking orders settled in Postgres.",
    incoming: [
      "routes/checkout.ts",
      "services/billing.ts",
      "services/invoices.ts",
    ],
    outgoing: [],
  },
};

interface DemoEdge {
  id: string;
  from: FileId;
  to: FileId;
  path: string;
}

/* Coordinates in a 760 x 310 SVG space matching the 3-column node layout */
const DEMO_EDGES: DemoEdge[] = [
  {
    id: "checkout-billing",
    from: "routes/checkout.ts",
    to: "services/billing.ts",
    path: "M 218 106 C 254 106, 254 106, 286 106",
  },
  {
    id: "checkout-orders",
    from: "routes/checkout.ts",
    to: "db/orders.ts",
    path: "M 218 106 C 266 106, 266 254, 540 218",
  },
  {
    id: "webhooks-billing",
    from: "routes/webhooks.ts",
    to: "services/billing.ts",
    path: "M 218 142 C 252 142, 252 106, 286 106",
  },
  {
    id: "webhooks-invoices",
    from: "routes/webhooks.ts",
    to: "services/invoices.ts",
    path: "M 218 142 C 254 142, 254 142, 286 142",
  },
  {
    id: "billing-stripe",
    from: "services/billing.ts",
    to: "lib/stripe.ts",
    path: "M 474 106 C 506 106, 506 100, 540 100",
  },
  {
    id: "billing-orders",
    from: "services/billing.ts",
    to: "db/orders.ts",
    path: "M 474 106 C 508 106, 508 218, 540 218",
  },
  {
    id: "invoices-orders",
    from: "services/invoices.ts",
    to: "db/orders.ts",
    path: "M 474 142 C 508 142, 508 218, 540 218",
  },
];

const CATEGORIES = [
  { label: "Routes", count: 2, color: "var(--kind-1)" },
  { label: "Services", count: 2, color: "var(--kind-9)" },
  { label: "Clients", count: 1, color: "var(--kind-6)" },
  { label: "Data", count: 1, color: "var(--kind-3)" },
];

/**
 * Interactive framed workspace window for the landing hero. Uses the same
 * warm surfaces, hairline borders, and semantic edge colours as the live app.
 */
export function HeroStage() {
  const [selected, setSelected] = useState<FileId>("services/billing.ts");
  const [rightTab, setRightTab] = useState<"detail" | "ask">("detail");
  const active = DEMO_FILES[selected];

  const isConnected = (id: FileId) =>
    id === selected ||
    active.incoming.includes(id) ||
    active.outgoing.includes(id);

  return (
    <div className="atlas-window overflow-hidden rounded-2xl">
      {/* Window chrome bar */}
      <div className="flex h-11 items-center gap-3 border-b border-hairline bg-chrome px-3.5">
        <div className="flex items-center gap-1.5" aria-hidden="true">
          <span className="size-2.5 rounded-full bg-foreground/15" />
          <span className="size-2.5 rounded-full bg-foreground/15" />
          <span className="size-2.5 rounded-full bg-foreground/15" />
        </div>

        <div className="h-3.5 w-px bg-hairline" aria-hidden="true" />

        <div className="flex min-w-0 items-center gap-2">
          <AtlasMark className="size-3.5 shrink-0 text-foreground/80" />
          <span className="truncate font-mono text-[11.5px] font-medium text-foreground">
            acme/billing-api
          </span>
          <span className="hidden items-center gap-1 rounded-full bg-foreground/[0.06] px-2 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline-flex">
            <GitCommitHorizontal className="size-3" />
            8f4c12a
          </span>
        </div>

        <div className="ml-auto flex items-center gap-1 rounded-lg bg-well/85 p-0.5 shadow-2xs">
          <span className="inline-flex items-center gap-1 rounded-md bg-raised px-2 py-1 text-[11px] font-medium text-foreground shadow-2xs">
            <MapIcon className="size-3" />
            Map
          </span>
          <span className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground">
            <Route className="size-3" />
            Routes
            <span className="font-mono text-[10px] opacity-70">4</span>
          </span>
        </div>
      </div>

      {/* Three-pane workspace anatomy */}
      <div className="grid lg:grid-cols-[172px_minmax(0,1fr)_272px]">
        {/* Left category rail */}
        <aside className="hidden border-r border-hairline bg-sidebar/75 p-2.5 lg:flex lg:flex-col">
          <p className="px-2 pb-1.5 text-[11px] font-medium text-muted-foreground">
            Roles
          </p>
          <ul className="space-y-0.5">
            {CATEGORIES.map((cat) => (
              <li
                key={cat.label}
                className="flex items-center justify-between rounded-md px-2 py-1.5 text-[12px] text-foreground/85"
              >
                <span className="flex items-center gap-2">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: cat.color }}
                  />
                  {cat.label}
                </span>
                <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                  {cat.count}
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-auto rounded-lg bg-surface/80 p-2.5 shadow-2xs">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">Resolved</span>
              <span className="font-mono font-medium tabular-nums">100%</span>
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-well">
              <div className="h-full w-full rounded-full bg-incoming/80" />
            </div>
            <p className="mt-1.5 text-[10.5px] leading-snug text-muted-foreground">
              7 imports parsed · 0 unresolved
            </p>
          </div>
        </aside>

        {/* Center dependency canvas */}
        <div className="atlas-dot-well relative min-h-[300px] overflow-x-auto p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">
              Click any file row to trace incoming and outgoing imports
            </span>
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-3 rounded-full bg-incoming" />
                Incoming
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-3 rounded-full bg-outgoing" />
                Outgoing
              </span>
            </div>
          </div>

          {/* Interactive SVG + positioned panels container */}
          <div className="relative mx-auto h-[286px] w-[720px] max-w-full min-w-[640px]">
            <svg
              viewBox="0 0 760 310"
              className="pointer-events-none absolute inset-0 h-full w-full"
              aria-hidden="true"
            >
              {DEMO_EDGES.map((edge) => {
                const isIncoming = edge.to === selected;
                const isOutgoing = edge.from === selected;
                const stroke = isIncoming
                  ? "var(--incoming)"
                  : isOutgoing
                    ? "var(--outgoing)"
                    : "var(--edge)";
                const opacity = isIncoming || isOutgoing ? 0.95 : 0.25;
                const width = isIncoming || isOutgoing ? 2 : 1.25;

                return (
                  <path
                    key={edge.id}
                    d={edge.path}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={width}
                    strokeLinecap="round"
                    opacity={opacity}
                    className="transition-[stroke,opacity,stroke-width] duration-200"
                  />
                );
              })}
            </svg>

            {/* Column 1: routes/ panel */}
            <StageFolderCard
              title="routes/"
              count={2}
              style={{ left: "2%", top: "17%", width: "26.5%" }}
            >
              {(["routes/checkout.ts", "routes/webhooks.ts"] as FileId[]).map(
                (id) => (
                  <StageFileRow
                    key={id}
                    file={DEMO_FILES[id]}
                    selected={selected === id}
                    dimmed={!isConnected(id)}
                    relation={
                      active.incoming.includes(id)
                        ? "incoming"
                        : active.outgoing.includes(id)
                          ? "outgoing"
                          : null
                    }
                    onSelect={() => setSelected(id)}
                  />
                ),
              )}
            </StageFolderCard>

            {/* Column 2: services/ panel */}
            <StageFolderCard
              title="services/"
              count={2}
              style={{ left: "37.5%", top: "17%", width: "25%" }}
            >
              {(
                ["services/billing.ts", "services/invoices.ts"] as FileId[]
              ).map((id) => (
                <StageFileRow
                  key={id}
                  file={DEMO_FILES[id]}
                  selected={selected === id}
                  dimmed={!isConnected(id)}
                  relation={
                    active.incoming.includes(id)
                      ? "incoming"
                      : active.outgoing.includes(id)
                        ? "outgoing"
                        : null
                  }
                  onSelect={() => setSelected(id)}
                />
              ))}
            </StageFolderCard>

            {/* Column 3: lib/ + db/ panels */}
            <StageFolderCard
              title="lib/"
              count={1}
              style={{ left: "71%", top: "15%", width: "26%" }}
            >
              <StageFileRow
                file={DEMO_FILES["lib/stripe.ts"]}
                selected={selected === "lib/stripe.ts"}
                dimmed={!isConnected("lib/stripe.ts")}
                relation={
                  active.incoming.includes("lib/stripe.ts")
                    ? "incoming"
                    : active.outgoing.includes("lib/stripe.ts")
                      ? "outgoing"
                      : null
                }
                onSelect={() => setSelected("lib/stripe.ts")}
              />
            </StageFolderCard>

            <StageFolderCard
              title="db/"
              count={1}
              style={{ left: "71%", top: "53%", width: "26%" }}
            >
              <StageFileRow
                file={DEMO_FILES["db/orders.ts"]}
                selected={selected === "db/orders.ts"}
                dimmed={!isConnected("db/orders.ts")}
                relation={
                  active.incoming.includes("db/orders.ts")
                    ? "incoming"
                    : active.outgoing.includes("db/orders.ts")
                      ? "outgoing"
                      : null
                }
                onSelect={() => setSelected("db/orders.ts")}
              />
            </StageFolderCard>
          </div>
        </div>

        {/* Right inspector / Ask preview */}
        <aside className="flex flex-col border-t border-hairline bg-surface lg:border-t-0 lg:border-l">
          <div className="flex items-center justify-between border-b border-hairline px-3 py-2">
            <div className="flex items-center gap-1 rounded-lg bg-well/80 p-0.5">
              <button
                type="button"
                onClick={() => setRightTab("detail")}
                className={cn(
                  "rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                  rightTab === "detail"
                    ? "bg-raised text-foreground shadow-2xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Inspector
              </button>
              <button
                type="button"
                onClick={() => setRightTab("ask")}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                  rightTab === "ask"
                    ? "bg-raised text-foreground shadow-2xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <MessageSquare className="size-3" />
                Ask
              </button>
            </div>
            <span className="rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[10.5px] font-medium text-muted-foreground">
              {active.role}
            </span>
          </div>

          {rightTab === "detail" ? (
            <div className="flex flex-1 flex-col gap-3.5 p-3.5 text-left">
              <div>
                <p className="font-mono text-[12px] font-medium text-foreground">
                  {active.id}
                </p>
                <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
                  {active.summary}
                </p>
              </div>

              <div className="space-y-2 border-t border-hairline pt-3">
                <p className="text-[11px] font-medium text-muted-foreground">
                  Incoming ({active.incoming.length})
                </p>
                {active.incoming.length === 0 ? (
                  <p className="text-[11.5px] text-muted-foreground/75">
                    Entry point — no local importers.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {active.incoming.map((id) => (
                      <li key={id}>
                        <button
                          type="button"
                          onClick={() => setSelected(id)}
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left font-mono text-[11px] text-foreground/90 transition-colors hover:bg-foreground/[0.05]"
                        >
                          <span className="size-1.5 shrink-0 rounded-full bg-incoming" />
                          {id}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="space-y-2 border-t border-hairline pt-3">
                <p className="text-[11px] font-medium text-muted-foreground">
                  Outgoing ({active.outgoing.length})
                </p>
                {active.outgoing.length === 0 ? (
                  <p className="text-[11.5px] text-muted-foreground/75">
                    Leaf module — no local imports.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {active.outgoing.map((id) => (
                      <li key={id}>
                        <button
                          type="button"
                          onClick={() => setSelected(id)}
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left font-mono text-[11px] text-foreground/90 transition-colors hover:bg-foreground/[0.05]"
                        >
                          <span className="size-1.5 shrink-0 rounded-full bg-outgoing" />
                          {id}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-1 flex-col gap-3 p-3.5 text-left">
              <div className="self-end rounded-xl rounded-br-sm bg-foreground/[0.07] px-3 py-2 text-[11.5px] text-foreground">
                What touches order settlement?
              </div>
              <div className="space-y-2 text-[11.5px] leading-relaxed text-foreground/90">
                <div className="inline-flex items-center gap-1.5 rounded-md bg-well/70 px-2 py-0.5 font-mono text-[10.5px] text-muted-foreground">
                  Checked 3 neighbours · 1 file read
                </div>
                <p>
                  Paid webhooks land in{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setSelected("routes/webhooks.ts");
                      setRightTab("detail");
                    }}
                    className="rounded bg-foreground/[0.07] px-1 py-0.5 font-mono text-[10.5px] text-foreground hover:bg-foreground/[0.12]"
                  >
                    routes/webhooks.ts
                  </button>
                  , settle through{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setSelected("services/billing.ts");
                      setRightTab("detail");
                    }}
                    className="rounded bg-foreground/[0.07] px-1 py-0.5 font-mono text-[10.5px] text-foreground hover:bg-foreground/[0.12]"
                  >
                    services/billing.ts
                  </button>
                  , and mark rows settled in{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setSelected("db/orders.ts");
                      setRightTab("detail");
                    }}
                    className="rounded bg-foreground/[0.07] px-1 py-0.5 font-mono text-[10.5px] text-foreground hover:bg-foreground/[0.12]"
                  >
                    db/orders.ts
                  </button>
                  .
                </p>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function StageFolderCard({
  title,
  count,
  style,
  children,
}: {
  title: string;
  count: number;
  style: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <div
      style={style}
      className="absolute overflow-hidden rounded-xl bg-surface shadow-sm"
    >
      <div className="flex items-center justify-between border-b border-hairline bg-chrome/70 px-2.5 py-1.5">
        <span className="flex items-center gap-1.5 font-mono text-[11px] font-medium text-foreground">
          <FolderOpen className="size-3 text-muted-foreground" />
          {title}
        </span>
        <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
          {count}
        </span>
      </div>
      <div className="space-y-0.5 p-1">{children}</div>
    </div>
  );
}

function StageFileRow({
  file,
  selected,
  dimmed,
  relation,
  onSelect,
}: {
  file: DemoFile;
  selected: boolean;
  dimmed: boolean;
  relation: "incoming" | "outgoing" | null;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left transition-all duration-150",
        selected
          ? "bg-selection/14 text-foreground ring-1 ring-selection/55"
          : "hover:bg-foreground/[0.05]",
        dimmed && "opacity-40 hover:opacity-80",
      )}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <span
          className="size-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: file.kindColor }}
        />
        <span className="truncate font-mono text-[11px]">{file.name}</span>
      </span>
      {relation ? (
        <span
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            relation === "incoming" ? "bg-incoming" : "bg-outgoing",
          )}
        />
      ) : null}
    </button>
  );
}

/**
 * Interactive folded vs unfolded folder demonstration for the "What it draws"
 * band. Clicking toggles between the folded summary box and expanded file rows.
 */
export function FolderFoldStage() {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="atlas-window overflow-hidden rounded-2xl">
      <div className="flex items-center justify-between border-b border-hairline bg-chrome px-3.5 py-2.5">
        <span className="font-mono text-[11px] text-muted-foreground">
          services/ · {expanded ? "expanded" : "folded"}
        </span>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-raised px-2.5 py-1 text-[11.5px] font-medium text-foreground shadow-2xs transition-colors hover:bg-background"
        >
          {expanded ? (
            <>
              <ChevronDown className="size-3.5 text-muted-foreground" />
              Fold folder
            </>
          ) : (
            <>
              <ChevronRight className="size-3.5 text-muted-foreground" />
              Open folder
            </>
          )}
        </button>
      </div>

      <div className="atlas-dot-well relative flex min-h-[250px] items-center justify-center p-6">
        <svg
          viewBox="0 0 500 220"
          className="pointer-events-none absolute inset-0 h-full w-full"
          aria-hidden="true"
        >
          {/* Left incoming curve(s) */}
          {expanded ? (
            <>
              <path
                d="M 110 88 C 148 88, 148 84, 180 84"
                fill="none"
                stroke="var(--incoming)"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <path
                d="M 110 132 C 148 132, 148 122, 180 122"
                fill="none"
                stroke="var(--edge)"
                strokeWidth="1.25"
                opacity="0.4"
              />
              {/* Right outgoing curves */}
              <path
                d="M 328 84 C 362 84, 362 84, 396 84"
                fill="none"
                stroke="var(--outgoing)"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <path
                d="M 328 122 C 362 122, 362 146, 396 146"
                fill="none"
                stroke="var(--edge)"
                strokeWidth="1.25"
                opacity="0.4"
              />
            </>
          ) : (
            <>
              <path
                d="M 110 110 C 146 110, 146 110, 184 110"
                fill="none"
                stroke="var(--incoming)"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <path
                d="M 324 110 C 360 110, 360 110, 396 110"
                fill="none"
                stroke="var(--outgoing)"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </>
          )}
        </svg>

        <div className="relative z-10 grid w-full max-w-[460px] grid-cols-[96px_minmax(0,1fr)_96px] items-center gap-6">
          {/* Caller pill */}
          <div className="rounded-xl bg-surface px-2.5 py-2 text-center shadow-xs">
            <span className="block font-mono text-[11px] font-medium">
              routes/
            </span>
            <span className="text-[10px] text-muted-foreground">2 callers</span>
          </div>

          {/* Center toggleable folder */}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="w-full overflow-hidden rounded-xl bg-surface text-left shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="flex items-center justify-between bg-chrome/75 px-3 py-2">
              <span className="flex items-center gap-1.5 font-mono text-[11.5px] font-medium">
                {expanded ? (
                  <FolderOpen className="size-3.5 text-selection" />
                ) : (
                  <Folder className="size-3.5 text-muted-foreground" />
                )}
                services/
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">
                3 files
              </span>
            </div>

            {expanded ? (
              <div className="space-y-1 border-t border-hairline p-1.5">
                <div className="flex items-center justify-between rounded-lg bg-selection/14 px-2.5 py-1.5 font-mono text-[11px] text-foreground ring-1 ring-selection/55">
                  <span>billing.ts</span>
                  <span className="text-[10px] text-muted-foreground">
                    2 in · 2 out
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-lg px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground">
                  <span>invoices.ts</span>
                  <span className="text-[10px] opacity-70">1 in · 1 out</span>
                </div>
                <div className="flex items-center justify-between rounded-lg px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground">
                  <span>refunds.ts</span>
                  <span className="text-[10px] opacity-70">0 in · 1 out</span>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between border-t border-hairline px-3 py-2.5 text-[11px] text-muted-foreground">
                <span>Folded module</span>
                <span className="font-mono text-[10.5px]">3 in · 4 out</span>
              </div>
            )}
          </button>

          {/* Target pill */}
          <div className="rounded-xl bg-surface px-2.5 py-2 text-center shadow-xs">
            <span className="block font-mono text-[11px] font-medium">
              lib/ &amp; db/
            </span>
            <span className="text-[10px] text-muted-foreground">2 targets</span>
          </div>
        </div>
      </div>
    </div>
  );
}
