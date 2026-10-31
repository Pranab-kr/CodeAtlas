import { SignUp } from "@clerk/nextjs";
import { Suspense } from "react";

import { AuthShell } from "@/components/auth-shell";

export default function SignUpPage() {
  return (
    <AuthShell mode="sign-up">
      <Suspense>
        <SignUp
          fallbackRedirectUrl="/dashboard"
          signInFallbackRedirectUrl="/dashboard"
        />
      </Suspense>
    </AuthShell>
  );
}
