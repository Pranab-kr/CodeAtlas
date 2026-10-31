import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import { Suspense, type ReactNode } from "react";
import { AtlasMark } from "@/components/brand/mark";
import { ModeToggle } from "@/components/mode-toggle";
import { Separator } from "@/components/ui/separator";
import { requireActiveOrganization } from "@/lib/active-org";

async function OrganizationBadge() {
  const { name, orgId } = await requireActiveOrganization();
  return (
    <span
      className="max-w-64 truncate font-mono text-[11px] text-muted-foreground"
      title={orgId}
    >
      {name}
    </span>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="flex h-11 shrink-0 items-center gap-3 border-b border-border bg-card px-3">
        {/* Full navigation: the dashboard can hold live analysis channels. */}
        <a
          href="/dashboard"
          className="flex items-center gap-2 text-[13px] font-medium tracking-tight"
        >
          <AtlasMark className="size-[16px]" />
          CodeAtlas
        </a>
        <Separator orientation="vertical" className="h-4" />
        <Suspense fallback={<span className="h-3 w-40" />}>
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
