import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";

// Loading env here means a missing value fails when the proxy module is
// evaluated at startup, not on the first request that needs it.
const PUBLIC_PATHS = [env.clerkSignInUrl, env.clerkSignUpUrl];
const START_PATH = "/start";

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

export default clerkMiddleware(async (auth, request) => {
  const { pathname } = request.nextUrl;

  if (isPublic(pathname)) {
    return;
  }

  const { userId, orgId } = await auth();

  if (!userId) {
    await auth.protect();
    return;
  }

  if (!orgId && pathname !== START_PATH) {
    return NextResponse.redirect(new URL(START_PATH, request.url));
  }

  if (orgId && pathname === START_PATH) {
    return NextResponse.redirect(new URL("/", request.url));
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
