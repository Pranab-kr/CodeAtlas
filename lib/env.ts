function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

const aiBaseUrl = optional("AI_BASE_URL");
const aiApiKey = optional("AI_API_KEY");
const aiModel = optional("AI_MODEL");
const langsmithApiKey = optional("LANGSMITH_API_KEY");

// A deliberately missing key is a supported state: the map still works, and
// the explanation pane says why it can't explain yet.
export const env = {
  clerkPublishableKey: required("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"),
  clerkSecretKey: required("CLERK_SECRET_KEY"),
  clerkSignInUrl: required("NEXT_PUBLIC_CLERK_SIGN_IN_URL"),
  clerkSignUpUrl: required("NEXT_PUBLIC_CLERK_SIGN_UP_URL"),
  supabaseUrl: required("NEXT_PUBLIC_SUPABASE_URL"),
  supabasePublishableKey: required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
  // The pipeline's writer. No NEXT_PUBLIC_ prefix, so it can't be bundled.
  supabaseSecretKey: required("SUPABASE_API_KEY"),
  aiBaseUrl,
  aiApiKey,
  aiModel,
  aiConfigured:
    aiBaseUrl !== null && aiApiKey !== null && aiModel !== null,
  // Tracing is only on when both halves are present. The SDK reads these from
  // the environment itself; this copy exists so the interface can say the
  // state out loud.
  tracingConfigured:
    process.env.LANGSMITH_TRACING?.trim().toLowerCase() === "true" &&
    langsmithApiKey !== null,
};
