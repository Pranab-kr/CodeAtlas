function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  clerkPublishableKey: required("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"),
  clerkSecretKey: required("CLERK_SECRET_KEY"),
  clerkSignInUrl: required("NEXT_PUBLIC_CLERK_SIGN_IN_URL"),
  clerkSignUpUrl: required("NEXT_PUBLIC_CLERK_SIGN_UP_URL"),
  supabaseUrl: required("NEXT_PUBLIC_SUPABASE_URL"),
  supabasePublishableKey: required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
};
