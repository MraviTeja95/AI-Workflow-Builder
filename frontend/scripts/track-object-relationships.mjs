import fs from "node:fs";
import path from "node:path";



const env = loadEnv();
void env;

const metadataUrl = "https://zggynlwwpraxjmbawiym.hasura.ap-southeast-1.nhost.run/v1/metadata";
const adminSecret = env.HASURA_GRAPHQL_ADMIN_SECRET;

async function trackRelationships() {
  const payload = {
    type: "bulk",
    args: [
      {
        type: "pg_create_object_relationship",
        args: {
          source: "default",
          table: { schema: "public", name: "org_members" },
          name: "organization",
          using: { foreign_key_constraint_on: "org_id" },
        },
      },
      {
        type: "pg_create_object_relationship",
        args: {
          source: "default",
          table: { schema: "public", name: "workflow_steps" },
          name: "workflow",
          using: { foreign_key_constraint_on: "workflow_id" },
        },
      },
      {
        type: "pg_create_object_relationship",
        args: {
          source: "default",
          table: { schema: "public", name: "workflow_triggers" },
          name: "workflow",
          using: { foreign_key_constraint_on: "workflow_id" },
        },
      },
    ],
  };

  const res = await fetch(metadataUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-hasura-admin-secret": adminSecret,
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  console.log("Track relationships result:", JSON.stringify(data, null, 2));
}

trackRelationships();
