import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { env } from "@/lib/env";
import { cn } from "@/lib/utils";
import "./globals.css";

// The shadcn preset sets the sans face to Inter. Paths and identifiers stay
// monospace.
const inter = Inter({
  variable: "--font-inter",
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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={cn("h-full", inter.variable, geistMono.variable)}
      suppressHydrationWarning
    >
      <body className="min-h-dvh bg-background text-foreground antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <ClerkProvider
            publishableKey={env.clerkPublishableKey}
            signInUrl={env.clerkSignInUrl}
            signUpUrl={env.clerkSignUpUrl}
            signInFallbackRedirectUrl="/dashboard"
            signUpFallbackRedirectUrl="/dashboard"
            afterSignOutUrl="/sign-in"
            appearance={{
              options: {
                unsafe_disableDevelopmentModeWarnings: true,
                socialButtonsPlacement: "top",
                socialButtonsVariant: "blockButton",
              },
              variables: {
                fontFamily: "var(--font-inter), system-ui, sans-serif",
                fontFamilyButtons: "var(--font-inter), system-ui, sans-serif",
                colorPrimary: "var(--primary)",
                colorPrimaryForeground: "var(--primary-foreground)",
                colorForeground: "var(--foreground)",
                colorMuted: "var(--muted)",
                colorMutedForeground: "var(--muted-foreground)",
                colorBackground: "var(--surface)",
                colorInput: "var(--background)",
                colorInputForeground: "var(--foreground)",
                colorBorder: "var(--border)",
                colorNeutral: "var(--foreground)",
                borderRadius: "var(--radius)",
              },
              elements: {
                cardBox: "atlas-clerk-cardbox",
                card: "atlas-clerk-card",
                headerTitle: "atlas-clerk-title",
                headerSubtitle: "atlas-clerk-subtitle",
                socialButtonsBlockButton: "atlas-clerk-social-btn",
                formFieldInput: "atlas-clerk-input",
                formButtonPrimary: "atlas-clerk-primary-btn",
                footer: "atlas-clerk-footer",
                footerAction: "atlas-clerk-footer-action",
                userButtonPopoverCard: "atlas-clerk-popover",
                organizationSwitcherPopoverCard: "atlas-clerk-popover",
                userButtonPopoverFooter: "hidden",
                organizationSwitcherPopoverFooter: "hidden",
              },
            }}
          >
            <TooltipProvider>{children}</TooltipProvider>
          </ClerkProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
