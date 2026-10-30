const INTERNAL_PATH = /^\/(?!\/)[\x20-\x7e]*$/;

/**
 * A destination carried through sign-in and workspace setup. Only a
 * same-origin path is accepted, so the parameter can't become an open
 * redirect.
 */
export function nextPath(
  value: string | string[] | null | undefined,
  fallback = "/dashboard",
): string {
  if (typeof value !== "string" || !INTERNAL_PATH.test(value)) {
    return fallback;
  }
  return value;
}
