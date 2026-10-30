import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { nextPath } from "@/lib/navigation";

// Loading env here means a missing value fails when the proxy module is
// evaluated at startup, not on the first request that needs it.
const PUBLIC_PATHS = [env.clerkSignInUrl, env.clerkSignUpUrl];
const HOME_PATH = "/";
const START_PATH = "/start";
const DASHBOARD_PATH = "/dashboard";
// The agent's tools have no Clerk session. The route checks the database-
// signed credential instead, and that credential names one analysis.
const AGENT_TOOLS_PATH = "/api/agent/tools";

function isPublic(pathname: string): boolean {
  return (
    pathname === AGENT_TOOLS_PATH ||
    PUBLIC_PATHS.some(
      (path) => pathname === path || pathname.startsWith(`${path}/`),
    )
  );
}

export default clerkMiddleware(async (auth, request) => {
  const { pathname } = request.nextUrl;

  // The root is the marketing page when signed out. The dashboard lives at
  // its own path, so a session never lands on marketing copy.
  if (pathname === HOME_PATH) {
    const { userId, orgId } = await auth();
    if (!userId) {
      return;
    }
    return NextResponse.redirect(
      new URL(orgId ? DASHBOARD_PATH : START_PATH, request.url),
    );
  }

  if (isPublic(pathname)) {
    return;
  }

  const { userId, orgId } = await auth();

  if (!userId) {
    await auth.protect();
    return;
  }

  if (!orgId && pathname !== START_PATH) {
    // Carry the intended destination through workspace setup. A repository
    // URL submitted from the landing page reaches the analysis, not the
    // dashboard.
    const start = new URL(START_PATH, request.url);
    start.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(start);
  }

  if (orgId && pathname === START_PATH) {
    return NextResponse.redirect(
      new URL(nextPath(request.nextUrl.searchParams.get("next")), request.url),
    );
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
