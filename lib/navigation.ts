const INTERNAL_PATH = /^\/(?![/\\])[\x20-\x5b\x5d-\x7e]*$/;
const INTERNAL_ORIGIN = "http://codeatlas.internal";

/**
 * A destination carried through sign-in and workspace setup. Only a
 * same-origin path is accepted, so the parameter can't become an open
 * redirect (including backslash-prefixed paths like `/\evil.com`).
 */
export function nextPath(
  value: string | string[] | null | undefined,
  fallback = "/dashboard",
): string {
  if (typeof value !== "string" || !INTERNAL_PATH.test(value)) {
    return fallback;
  }
  try {
    const resolved = new URL(value, INTERNAL_ORIGIN);
    if (resolved.origin !== INTERNAL_ORIGIN) {
      return fallback;
    }
  } catch {
    return fallback;
  }
  return value;
}
