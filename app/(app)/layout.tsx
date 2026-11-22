import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import { Suspense, type ReactNode } from "react";
import { AtlasMark } from "@/components/brand/mark";
import { ModeToggle } from "@/components/mode-toggle";
import { requireActiveOrganization } from "@/lib/active-org";

async function OrganizationBadge() {
  const { name, orgId } = await requireActiveOrganization();
  return (
    <span
      className="max-w-64 truncate rounded-full bg-well/90 px-2.5 py-0.5 text-[11.5px] font-medium text-muted-foreground shadow-2xs"
      title={orgId}
    >
      {name}
    </span>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-hairline bg-chrome px-4">
        {/* Full navigation: the dashboard can hold live analysis channels. */}
        <a
          href="/dashboard"
          className="group flex items-center gap-2 text-[13.5px] font-medium tracking-[-0.015em]"
        >
          <span className="flex size-6.5 items-center justify-center rounded-lg bg-surface shadow-2xs transition-transform duration-150 group-hover:scale-[1.03]">
            <AtlasMark className="size-3.5" />
          </span>
          <span>CodeAtlas</span>
        </a>
        <span className="h-4 w-px bg-hairline" aria-hidden="true" />
        <Suspense
          fallback={
            <span className="h-5 w-32 animate-pulse rounded-full bg-well" />
          }
        >
          <OrganizationBadge />
        </Suspense>
        <div className="ml-auto flex items-center gap-2">
          <OrganizationSwitcher
            hidePersonal
            skipInvitationScreen
            afterSelectOrganizationUrl="/dashboard"
            afterCreateOrganizationUrl="/dashboard"
          />
          <ModeToggle />
          <UserButton />
        </div>
      </header>
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
