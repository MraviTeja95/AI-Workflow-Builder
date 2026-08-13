import fs from "node:fs";
import path from "node:path";

function loadEnv() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf-8").split("\n");
    const env = {};
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx > 0) {
        const k = trimmed.slice(0, idx).trim();
        let v = trimmed.slice(idx + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        env[k] = v;
      }
    }
    return env;
  }
  return process.env;
}

const env = loadEnv();
const metadataUrl = "https://zggynlwwpraxjmbawiym.hasura.ap-southeast-1.nhost.run/v1/metadata";
const adminSecret = env.HASURA_GRAPHQL_ADMIN_SECRET;

async function setupWebhookHasuraAction() {
  const handlerUrl = "https://zggynlwwpraxjmbawiym.functions.ap-southeast-1.nhost.run/v1/trigger-webhook-workflow";

  // 1. Export current metadata to see custom types and actions
  const exportRes = await fetch(metadataUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-hasura-admin-secret": adminSecret },
    body: JSON.stringify({ type: "export_metadata", args: {} }),
  });
  const metadata = await exportRes.json();
  const customTypes = metadata.custom_types || {
    scalars: [],
    input_objects: [],
    objects: [],
    enums: [],
  };

  const existingObjects = customTypes.objects || [];
  if (!existingObjects.some((o) => o.name === "TriggerWorkflowRunOutput")) {
    existingObjects.push({
      name: "TriggerWorkflowRunOutput",
      fields: [
        { name: "workflow_run_id", type: "uuid!" },
        { name: "status", type: "String!" },
        { name: "message", type: "String!" },
      ],
    });
  }

  // 2. Drop existing action if it exists, then recreate cleanly
  const existingActions = metadata.actions || [];
  const actionExists = existingActions.some((a) => a.name === "triggerWebhookWorkflow");

  const ops = [
    {
      type: "set_custom_types",
      args: {
        scalars: customTypes.scalars || [],
        input_objects: customTypes.input_objects || [],
        objects: existingObjects,
        enums: customTypes.enums || [],
      },
    },
  ];

  if (actionExists) {
    ops.push({
      type: "drop_action",
      args: {
        name: "triggerWebhookWorkflow",
        clear_data: true,
      },
    });
  }

  ops.push({
    type: "create_action",
    args: {
      name: "triggerWebhookWorkflow",
      definition: {
        kind: "synchronous",
        handler: handlerUrl,
        forward_client_headers: true,
        arguments: [
          {
            name: "workflow_id",
            type: "uuid!",
          },
          {
            name: "secret",
            type: "String",
          },
          {
            name: "event",
            type: "String",
          },
        ],
        type: "mutation",
        output_type: "TriggerWorkflowRunOutput",
      },
      permissions: [
        {
          role: "user",
        },
        {
          role: "public",
        },
      ],
    },
  });

  const res = await fetch(metadataUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-hasura-admin-secret": adminSecret },
    body: JSON.stringify({ type: "bulk", args: ops }),
  });

  const data = await res.json();
  console.log("Setup Webhook Action result:", JSON.stringify(data, null, 2));
}

setupWebhookHasuraAction();
