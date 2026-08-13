import fs from "node:fs";
import path from "node:path";



const env = loadEnv();
void env;

const metadataUrl = "https://zggynlwwpraxjmbawiym.hasura.ap-southeast-1.nhost.run/v1/metadata";
const adminSecret = env.HASURA_GRAPHQL_ADMIN_SECRET;

async function setupHasuraAction() {
  const handlerUrl = "https://zggynlwwpraxjmbawiym.functions.ap-southeast-1.nhost.run/v1/trigger-workflow-run";

  const payload = {
    type: "bulk",
    args: [
      // 1. Set Custom Types
      {
        type: "set_custom_types",
        args: {
          scalars: [],
          input_objects: [],
          objects: [
            {
              name: "TriggerWorkflowRunOutput",
              fields: [
                { name: "workflow_run_id", type: "uuid!" },
                { name: "status", type: "String!" },
                { name: "message", type: "String!" },
              ],
            },
          ],
          enums: [],
        },
      },
      // 2. Create Action triggerWorkflowRun
      {
        type: "create_action",
        args: {
          name: "triggerWorkflowRun",
          definition: {
            kind: "synchronous",
            handler: handlerUrl,
            forward_client_headers: true,
            arguments: [
              {
                name: "workflow_id",
                type: "uuid!",
              },
            ],
            type: "mutation",
            output_type: "TriggerWorkflowRunOutput",
          },
          permissions: [
            {
              role: "user",
            },
          ],
        },
      },
    ],
  };

  const res = await fetch(metadataUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-hasura-admin-secret": adminSecret },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  console.log("Setup Action result:", JSON.stringify(data, null, 2));
}

setupHasuraAction();
