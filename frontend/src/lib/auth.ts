import "server-only";
import { executeGraphQL } from "./hasura";

export interface UserOrgMembership {
  orgId: string;
  orgName: string;
  userId: string;
  role: "owner" | "editor" | "viewer" | string;
}

const GET_USER_MEMBERSHIP_QUERY = `
  query GetUserMembership($userId: uuid!) {
    org_members(where: { user_id: { _eq: $userId } }) {
      id
      org_id
      user_id
      role
      organization {
        id
        name
        quota_limit
        quota_used
      }
    }
  }
`;

const GET_WORKFLOW_AUTH_QUERY = `
  query GetWorkflowAuth($workflowId: uuid!) {
    workflows_by_pk(id: $workflowId) {
      id
      name
      org_id
      created_by
      organization {
        id
        name
      }
    }
  }
`;

/**
 * Extract authenticated user ID from request headers, session variables, JWT, or payload
 */
export function extractUserId(request: Request, body?: Record<string, unknown>): string | null {
  // 1. Check Hasura Action session variables
  const sessionVars = body?.session_variables as Record<string, string> | undefined;
  if (sessionVars?.["x-hasura-user-id"]) {
    return sessionVars["x-hasura-user-id"];
  }

  // 2. Check x-hasura-user-id header
  const headerUserId = request.headers.get("x-hasura-user-id");
  if (headerUserId) {
    return headerUserId;
  }

  // 3. Check Authorization: Bearer <jwt>
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const token = authHeader.slice(7).trim();
      const parts = token.split(".");
      if (parts.length === 3) {
        const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        const payloadJson = Buffer.from(base64, "base64").toString("utf-8");
        const payload = JSON.parse(payloadJson);
        const hasuraClaims = payload["https://hasura.io/jwt/claims"];
        const jwtUserId =
          hasuraClaims?.["x-hasura-user-id"] ||
          hasuraClaims?.["X-Hasura-User-Id"] ||
          payload.sub;
        if (jwtUserId) return jwtUserId;
      }
    } catch {
      // ignore parsing error
    }
  }

  // 4. Check body or query params for direct internal API calls
  if (body?.userId && typeof body.userId === "string") {
    return body.userId;
  }

  try {
    const url = new URL(request.url);
    const queryUserId = url.searchParams.get("userId");
    if (queryUserId) return queryUserId;
  } catch {
    // ignore URL parsing error
  }

  return null;
}

/**
 * Resolve user's actual organization membership and role from the database
 */
export async function getUserMembership(userId: string): Promise<UserOrgMembership | null> {
  const data = await executeGraphQL<{
    org_members: Array<{
      id: string;
      org_id: string;
      user_id: string;
      role: string;
      organization: {
        id: string;
        name: string;
        quota_limit: number;
        quota_used: number;
      };
    }>;
  }>(GET_USER_MEMBERSHIP_QUERY, { userId });

  const member = data.org_members?.[0];
  if (!member) return null;

  return {
    orgId: member.org_id,
    orgName: member.organization?.name || "Organization",
    userId: member.user_id,
    role: (member.role || "viewer").toLowerCase(),
  };
}

/**
 * Validate Layer 2 Privileged Operations
 * Only an OWNER can configure:
 * 1. db_write step
 * 2. notify step
 * 3. webhook trigger
 */
export function validatePrivilegedOperations(
  steps: Array<{ type: string }>,
  triggers: Array<{ type: string }>,
  userRole: string
): { allowed: boolean; reason?: string } {
  const normalizedRole = (userRole || "viewer").toLowerCase();

  const hasDbWrite = steps.some((s) => s.type === "db_write");
  const hasNotify = steps.some((s) => s.type === "notify");
  const hasWebhookTrigger = triggers.some(
    (t) => (t.type || "").toLowerCase() === "webhook"
  );

  if (hasDbWrite || hasNotify || hasWebhookTrigger) {
    if (normalizedRole !== "owner") {
      const privilegedItems: string[] = [];
      if (hasDbWrite) privilegedItems.push("db_write step");
      if (hasNotify) privilegedItems.push("notify step");
      if (hasWebhookTrigger) privilegedItems.push("webhook trigger");

      return {
        allowed: false,
        reason: `Access denied: Only an organization Owner can configure ${privilegedItems.join(", ")}. Role '${userRole}' is not authorized.`,
      };
    }
  }

  return { allowed: true };
}

/**
 * Check if a workflow belongs to a user's organization
 */
export async function getWorkflowOrg(workflowId: string): Promise<{ id: string; org_id: string; name: string } | null> {
  const data = await executeGraphQL<{
    workflows_by_pk: {
      id: string;
      name: string;
      org_id: string;
    } | null;
  }>(GET_WORKFLOW_AUTH_QUERY, { workflowId });

  return data.workflows_by_pk;
}
