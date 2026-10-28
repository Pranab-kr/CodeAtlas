export const THEME_COOKIE = "codeatlas-theme";

export type ThemePreference = "system" | "light" | "dark";

export function isThemePreference(
  value: string | undefined,
): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}
