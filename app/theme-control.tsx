"use client";

import { useLayoutEffect, useState } from "react";
import {
  THEME_COOKIE,
  type ThemePreference,
} from "./theme-preference";
import { useInitialTheme } from "./theme-provider";

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

function writeThemeCookie(preference: ThemePreference) {
  document.cookie = `${THEME_COOKIE}=${preference}; path=/; max-age=31536000; SameSite=Lax`;
}

export function ThemeControl() {
  const initialTheme = useInitialTheme();
  const [preference, setPreference] = useState<ThemePreference>(initialTheme);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = preference;
  }, [preference]);

  function choose(next: ThemePreference) {
    setPreference(next);
    writeThemeCookie(next);
  }

  return (
    <div
      role="group"
      aria-label="Theme"
      className="flex h-7 items-center border border-border"
    >
      {OPTIONS.map((option, index) => {
        const active = preference === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => choose(option.value)}
            className={`h-full px-2 text-[11px] focus-visible:outline-1 focus-visible:outline-offset-[-1px] focus-visible:outline-accent ${
              index > 0 ? "border-l border-border" : ""
            } ${
              active
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
