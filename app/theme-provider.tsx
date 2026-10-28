"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { ThemePreference } from "./theme-preference";

const ThemeContext = createContext<ThemePreference>("system");

export function ThemeProvider({
  initialTheme,
  children,
}: {
  initialTheme: ThemePreference;
  children: ReactNode;
}) {
  return (
    <ThemeContext.Provider value={initialTheme}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useInitialTheme() {
  return useContext(ThemeContext);
}
