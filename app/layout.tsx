import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { isThemePreference, THEME_COOKIE } from "./theme-preference";
import { ThemeProvider } from "./theme-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CodeAtlas",
  description: "A dependency map of a codebase, drawn from the code itself.",
};

// The theme cookie is read here so the root element ships with the right
// theme. That makes the layout request-bound rather than prerenderable.
export const instant = false;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const cookieTheme = (await cookies()).get(THEME_COOKIE)?.value;
  const theme = isThemePreference(cookieTheme) ? cookieTheme : "system";

  return (
    <html
      lang="en"
      data-theme={theme}
      className={`${geistSans.variable} ${geistMono.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="min-h-dvh bg-background text-foreground antialiased">
        <ThemeProvider initialTheme={theme}>
          <ClerkProvider
            publishableKey={env.clerkPublishableKey}
            signInUrl={env.clerkSignInUrl}
            signUpUrl={env.clerkSignUpUrl}
            signInFallbackRedirectUrl="/"
            signUpFallbackRedirectUrl="/"
            afterSignOutUrl="/sign-in"
            appearance={{
              variables: {
                colorPrimary: "var(--accent)",
                colorPrimaryForeground: "var(--accent-foreground)",
                colorForeground: "var(--foreground)",
                colorMuted: "var(--surface-muted)",
                colorMutedForeground: "var(--muted-foreground)",
                colorBackground: "var(--surface)",
                colorInput: "var(--surface)",
                colorInputForeground: "var(--foreground)",
                colorBorder: "var(--border)",
                borderRadius: "4px",
              },
            }}
          >
            {children}
          </ClerkProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
