import { auth } from "@clerk/nextjs/server";
import { connection } from "next/server";

export async function requireActiveOrganization() {
  await connection();
  const { orgId, orgRole, sessionClaims } = await auth();

  if (!orgId) {
    throw new Error("No active organization for this session.");
  }

  const name = sessionClaims.org_name;
  if (typeof name !== "string" || name.trim() === "") {
    throw new Error(
      'The session token has no org_name claim. Add {"org_name":"{{org.name}}"} to the Clerk session token claims.',
    );
  }

  return { orgId, orgRole, name };
}
