"use server";

import { auth } from "@clerk/nextjs/server";

import { env } from "@/lib/env";
import {
  parseRepositoryUrl,
  PipelineError,
  type Repository,
} from "@/lib/pipeline/github";

export interface LandingState {
  error: string | null;
  /** Where the browser goes once the URL is valid. */
  next: string | null;
}

const EMPTY: LandingState = { error: null, next: null };

/**
 * Validates the pasted URL on the landing page, then hands it to the same
 * flow the dashboard uses. Signed-out visitors go to sign-in with the analysis
 * as the return address, so the field is not decorative.
 */
export async function startFromLanding(
  _previous: LandingState,
  form: FormData,
): Promise<LandingState> {
  const value = form.get("url");
  if (typeof value !== "string" || value.trim() === "") {
    return { ...EMPTY, error: "Paste a GitHub repository URL" };
  }

  let repository: Repository;
  try {
    repository = parseRepositoryUrl(value);
  } catch (error) {
    return { ...EMPTY, error: messageOf(error) };
  }

  const destination = `/analyse?url=${encodeURIComponent(repository.url)}`;
  const { userId, orgId } = await auth();

  if (!userId) {
    return { ...EMPTY, next: signInFor(destination) };
  }

  return {
    ...EMPTY,
    next: orgId
      ? destination
      : `/start?next=${encodeURIComponent(destination)}`,
  };
}

function signInFor(destination: string): string {
  const separator = env.clerkSignInUrl.includes("?") ? "&" : "?";
  return `${env.clerkSignInUrl}${separator}redirect_url=${encodeURIComponent(
    destination,
  )}`;
}

function messageOf(error: unknown): string {
  if (error instanceof PipelineError) {
    return error.message;
  }
  return error instanceof Error ? error.message : String(error);
}
