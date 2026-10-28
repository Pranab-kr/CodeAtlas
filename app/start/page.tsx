import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ActivateWorkspace } from "./activate-workspace";

export default async function StartPage() {
  const { userId, orgId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  if (orgId) {
    redirect("/");
  }

  const clerk = await clerkClient();

  // Newest first, so an invited organization wins over an older membership.
  const memberships = await clerk.users.getOrganizationMembershipList({
    userId,
    limit: 1,
  });

  let organizationId = memberships.data[0]?.organization.id;

  if (!organizationId) {
    const user = await clerk.users.getUser(userId);
    const firstName = user.firstName?.trim();
    const organization = await clerk.organizations.createOrganization({
      name: firstName ? `${firstName}'s team` : "My team",
      createdBy: userId,
    });
    organizationId = organization.id;
  }

  return <ActivateWorkspace organizationId={organizationId} />;
}
