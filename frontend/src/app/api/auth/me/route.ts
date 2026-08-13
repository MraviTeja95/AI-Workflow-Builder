import { NextResponse } from "next/server";
import { executeGraphQL } from "@/lib/hasura";

const GET_USER_ORG_QUERY = `
  query GetUserOrganization($userId: uuid!) {
    organizations(where: { org_members: { user_id: { _eq: $userId } } }) {
      id
      name
      quota_limit
      quota_used
      org_members(where: { user_id: { _eq: $userId } }) {
        id
        user_id
        role
      }
    }
  }
`;

interface OrgMemberData {
  id: string;
  user_id: string;
  role: string;
}

interface OrganizationData {
  id: string;
  name: string;
  quota_limit: number;
  quota_used: number;
  org_members: OrgMemberData[];
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { error: "User ID parameter is required." },
        { status: 400 }
      );
    }

    const data = await executeGraphQL<{
      organizations: OrganizationData[];
    }>(GET_USER_ORG_QUERY, { userId });

    const organizations = data.organizations || [];

    if (organizations.length === 0) {
      return NextResponse.json({
        user: { id: userId },
        organization: null,
        role: null,
        message: "No organization found for this user.",
      });
    }

    const primaryOrg = organizations[0];
    const memberRecord = primaryOrg.org_members?.[0];

    return NextResponse.json({
      user: { id: userId },
      organization: {
        id: primaryOrg.id,
        name: primaryOrg.name,
        quota_limit: primaryOrg.quota_limit,
        quota_used: primaryOrg.quota_used,
      },
      role: memberRecord?.role || "viewer",
    });
  } catch (error) {
    const err = error as Error;
    console.error("Error retrieving user organization:", err);
    return NextResponse.json(
      { error: err.message || "Failed to retrieve user organization." },
      { status: 500 }
    );
  }
}
