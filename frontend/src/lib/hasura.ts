import "server-only";

export const DEFAULT_ORGANIZATION_ID =
  process.env.DEFAULT_ORGANIZATION_ID || "0101ca0e-6bab-4154-9cfc-d4b581ad3554";

export const DEFAULT_USER_ID =
  process.env.DEFAULT_USER_ID || "fb336480-d1b5-4c6b-8d6d-8cd6015e9713";

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{
    message: string;
    extensions?: Record<string, unknown>;
  }>;
}

export async function executeGraphQL<T>(
  query: string,
  variables: Record<string, unknown> = {}
): Promise<T> {
  const endpoint =
    process.env.HASURA_GRAPHQL_ENDPOINT ||
    process.env.NHOST_GRAPHQL_URL ||
    "https://zggynlwwpraxjmbawiym.hasura.ap-southeast-1.nhost.run/v1/graphql";

  const adminSecret = process.env.HASURA_GRAPHQL_ADMIN_SECRET;

  if (!adminSecret) {
    throw new Error(
      "HASURA_GRAPHQL_ADMIN_SECRET is not defined in server environment."
    );
  }

  const maxAttempts = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-hasura-admin-secret": adminSecret,
        },
        body: JSON.stringify({ query, variables }),
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        if (response.status >= 500 && attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 200 * attempt));
          continue;
        }
        throw new Error(
          `GraphQL HTTP Error (${response.status} ${response.statusText}): ${errorText.slice(0, 300)}`
        );
      }

      const json: GraphQLResponse<T> = await response.json();

      if (json.errors && json.errors.length > 0) {
        const errorMessages = json.errors.map((e) => e.message).join(", ");
        throw new Error(`GraphQL Error: ${errorMessages}`);
      }

      if (!json.data) {
        throw new Error("No data returned from GraphQL server.");
      }

      return json.data;
    } catch (err: unknown) {
      const error = err as Error;
      if (error.message.startsWith("GraphQL Error:")) {
        throw error;
      }
      const isFetchFail =
        error.message.toLowerCase().includes("fetch failed") ||
        error.name === "TimeoutError" ||
        error.name === "AbortError";
      lastError = isFetchFail
        ? new Error("Unable to connect to database service (network connection reset/timeout).")
        : error;

      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 200 * attempt));
        continue;
      }
    }
  }

  throw lastError || new Error("GraphQL request failed after multiple attempts.");
}

export const WORKFLOW_QUERIES = {
  GET_WORKFLOW_BY_ID: `
    query GetWorkflowById($id: uuid!) {
      workflows_by_pk(id: $id) {
        id
        name
        description
        org_id
        created_by
        created_at
        updated_at
        workflow_steps(order_by: { position: asc }) {
          id
          name
          type
          position
          config
          created_at
          updated_at
        }
        workflow_triggers {
          id
          type
          enabled
          config
          created_at
        }
      }
    }
  `,

  CREATE_WORKFLOW: `
    mutation CreateWorkflow($object: workflows_insert_input!) {
      insert_workflows_one(object: $object) {
        id
        name
        org_id
        created_by
        created_at
        updated_at
      }
    }
  `,

  UPDATE_WORKFLOW: `
    mutation UpdateWorkflow($id: uuid!, $name: String!, $updated_at: timestamptz!) {
      update_workflows_by_pk(
        pk_columns: { id: $id }
        _set: { name: $name, updated_at: $updated_at }
      ) {
        id
        name
        org_id
        created_by
        created_at
        updated_at
      }
    }
  `,

  SYNC_WORKFLOW_STEPS: `
    mutation SyncWorkflowSteps(
      $workflowId: uuid!
      $steps: [workflow_steps_insert_input!]!
    ) {
      delete_workflow_steps(where: { workflow_id: { _eq: $workflowId } }) {
        affected_rows
      }
      insert_workflow_steps(objects: $steps) {
        affected_rows
        returning {
          id
          name
          type
          position
          config
        }
      }
    }
  `,

  SYNC_WORKFLOW_TRIGGERS: `
    mutation SyncWorkflowTriggers(
      $workflowId: uuid!
      $triggers: [workflow_triggers_insert_input!]!
    ) {
      delete_workflow_triggers(where: { workflow_id: { _eq: $workflowId } }) {
        affected_rows
      }
      insert_workflow_triggers(objects: $triggers) {
        affected_rows
        returning {
          id
          type
          enabled
          config
        }
      }
    }
  `,
};
