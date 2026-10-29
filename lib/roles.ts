// The rail's taxonomy: every role a file can have, in the order the rail shows
// them, and which of them each framework can produce. Plain data with no
// imports, so a browser component can read it without pulling in the adapters
// that assign roles, or the parser and filesystem behind them.

// Reading order, fixed: routable surfaces first, then the layers behind them,
// then plumbing. Every framework's list is a subsequence of this one, so a
// category sits in the same place whichever repository it appears in.
export const ROLES = [
  // Routable surfaces
  { id: "page-route", label: "Page routes" },
  { id: "api-endpoint", label: "API endpoints" },
  { id: "server-action", label: "Server actions" },
  { id: "controller", label: "Controllers" },
  { id: "resolver", label: "Resolvers" },
  { id: "gateway", label: "Gateways" },
  // Layers behind them
  { id: "layout", label: "Layouts" },
  { id: "route-ui", label: "Loading & error UI" },
  { id: "service", label: "Services" },
  { id: "module", label: "Modules" },
  { id: "entity", label: "Entities" },
  { id: "model", label: "Models" },
  { id: "dto", label: "DTOs" },
  { id: "repository", label: "Repositories" },
  { id: "component", label: "Components" },
  { id: "hook", label: "Hooks" },
  { id: "util", label: "Utilities" },
  // Plumbing
  { id: "middleware", label: "Middleware" },
  { id: "guard", label: "Guards" },
  { id: "interceptor", label: "Interceptors" },
  { id: "pipe", label: "Pipes" },
  { id: "filter", label: "Exception filters" },
  { id: "metadata", label: "Metadata files" },
  { id: "instrumentation", label: "Instrumentation" },
  { id: "config", label: "Config files" },
  { id: "test", label: "Tests" },
] as const;

export type Role = (typeof ROLES)[number]["id"];

export const ROLE_IDS: readonly Role[] = ROLES.map((role) => role.id);

export function isRole(value: string): value is Role {
  return ROLE_IDS.some((role) => role === value);
}

/** The row for a file no convention gave a role. Always last in the rail. */
export const UNCLASSIFIED = "unclassified";

export type RailKey = Role | typeof UNCLASSIFIED;

export function railLabel(key: RailKey): string {
  if (key === UNCLASSIFIED) {
    return "Unclassified";
  }
  return ROLES.find((role) => role.id === key)?.label ?? key;
}

// Whatever the framework, tools load their config by name and test runners
// collect files by pattern.
const GENERIC: readonly Role[] = ["config", "test"];

const REACT: readonly Role[] = ["component", "hook"];

export const FRAMEWORK_ROLES = {
  "Next.js": [
    "page-route",
    "api-endpoint",
    "server-action",
    "layout",
    "route-ui",
    ...REACT,
    "middleware",
    "metadata",
    "instrumentation",
    ...GENERIC,
  ],
  NestJS: [
    "controller",
    "resolver",
    "gateway",
    "service",
    "module",
    "entity",
    "dto",
    "repository",
    "middleware",
    "guard",
    "interceptor",
    "pipe",
    "filter",
    ...GENERIC,
  ],
  React: [...REACT, ...GENERIC],
  none: GENERIC,
} as const satisfies Record<string, readonly Role[]>;

export type Framework = keyof typeof FRAMEWORK_ROLES;

export function isFramework(name: string): name is Framework {
  return Object.hasOwn(FRAMEWORK_ROLES, name);
}

export interface RailCategory {
  key: RailKey;
  count: number;
}

/**
 * The rail for a repository: every role its framework can produce, in
 * taxonomy order, then the unclassified files. A role the framework has but
 * the repository doesn't use still gets its row, at zero, so the categories
 * hold their places.
 */
export function railCategories(
  framework: string,
  roles: readonly (Role | null)[],
): RailCategory[] {
  const possible = new Set<Role>(GENERIC);
  if (isFramework(framework)) {
    for (const role of FRAMEWORK_ROLES[framework]) {
      possible.add(role);
    }
  }

  const counts = new Map<RailKey, number>();
  for (const role of roles) {
    const key = role ?? UNCLASSIFIED;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  // A role outside the framework's list is still shown: it means convention
  // and this table disagree, and dropping its files would hide them.
  for (const key of counts.keys()) {
    if (key !== UNCLASSIFIED) {
      possible.add(key);
    }
  }

  return [
    ...ROLE_IDS.filter((role) => possible.has(role)).map((key) => ({
      key,
      count: counts.get(key) ?? 0,
    })),
    { key: UNCLASSIFIED, count: counts.get(UNCLASSIFIED) ?? 0 },
  ];
}
