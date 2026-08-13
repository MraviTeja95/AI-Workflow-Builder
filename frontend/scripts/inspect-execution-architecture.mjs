import fs from "node:fs";
import path from "node:path";



const env = loadEnv();
void env;

const metadataUrl = "https://zggynlwwpraxjmbawiym.hasura.ap-southeast-1.nhost.run/v1/metadata";
const sqlUrl = "https://zggynlwwpraxjmbawiym.hasura.ap-southeast-1.nhost.run/v2/query";
const adminSecret = env.HASURA_GRAPHQL_ADMIN_SECRET;

async function inspectExecutionArchitecture() {
  console.log("=================================================================");
  console.log("   READ-ONLY ARCHITECTURE INSPECTION: WORKFLOW EXECUTION         ");
  console.log("=================================================================\n");

  // 1. Inspect Hasura Metadata for Actions & Custom Types
  console.log("1. Inspecting Hasura Actions in Metadata...");
  const metaRes = await fetch(metadataUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-hasura-admin-secret": adminSecret },
    body: JSON.stringify({ type: "export_metadata", version: 2, args: {} }),
  }).then((r) => r.json());

  const actions = metaRes.metadata?.actions || [];
  const customTypes = metaRes.metadata?.custom_types || {};
  console.log(`   • Existing Hasura Actions count: ${actions.length}`);
  console.log("   • Actions:", JSON.stringify(actions, null, 2));
  console.log("   • Custom Types:", JSON.stringify(customTypes, null, 2));

  // 2. Inspect workflow_runs Table Schema & Constraints
  console.log("\n2. Inspecting workflow_runs Table Schema...");
  const workflowRunsSql = `
    SELECT 
      column_name, 
      data_type, 
      is_nullable, 
      column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workflow_runs'
    ORDER BY ordinal_position;
  `;
  const workflowRunsCols = await fetch(sqlUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-hasura-admin-secret": adminSecret },
    body: JSON.stringify({ type: "run_sql", args: { source: "default", sql: workflowRunsSql } }),
  }).then((r) => r.json());

  console.log("   • workflow_runs columns:", JSON.stringify(workflowRunsCols.result, null, 2));

  // 3. Inspect step_runs Table Schema & Constraints
  console.log("\n3. Inspecting step_runs Table Schema...");
  const stepRunsSql = `
    SELECT 
      column_name, 
      data_type, 
      is_nullable, 
      column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'step_runs'
    ORDER BY ordinal_position;
  `;
  const stepRunsCols = await fetch(sqlUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-hasura-admin-secret": adminSecret },
    body: JSON.stringify({ type: "run_sql", args: { source: "default", sql: stepRunsSql } }),
  }).then((r) => r.json());

  console.log("   • step_runs columns:", JSON.stringify(stepRunsCols.result, null, 2));

  // 4. Inspect Constraints on workflow_runs, step_runs, and organizations
  console.log("\n4. Inspecting Database Check Constraints & Foreign Keys...");
  const constraintsSql = `
    SELECT 
      conrelid::regclass AS table_name,
      conname AS constraint_name, 
      contype AS constraint_type,
      pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE conrelid::regclass::text IN ('workflow_runs', 'step_runs', 'organizations')
    ORDER BY table_name, constraint_name;
  `;
  const constraintsRes = await fetch(sqlUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-hasura-admin-secret": adminSecret },
    body: JSON.stringify({ type: "run_sql", args: { source: "default", sql: constraintsSql } }),
  }).then((r) => r.json());

  console.log("   • Constraints:", JSON.stringify(constraintsRes.result, null, 2));

  // 5. Inspect Organizations Quota Columns
  console.log("\n5. Inspecting organizations Quota Structure...");
  const orgsSql = `
    SELECT id, name, quota_limit, quota_used, quota_period_start
    FROM public.organizations
    LIMIT 5;
  `;
  const orgsRes = await fetch(sqlUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-hasura-admin-secret": adminSecret },
    body: JSON.stringify({ type: "run_sql", args: { source: "default", sql: orgsSql } }),
  }).then((r) => r.json());

  console.log("   • Sample organizations quota data:", JSON.stringify(orgsRes.result, null, 2));

  // 6. Test Nhost Functions Endpoint Connectivity
  console.log("\n6. Inspecting Nhost Functions Endpoint Connectivity...");
  const functionsUrl = `https://${env.NHOST_SUBDOMAIN || "zggynlwwpraxjmbawiym"}.functions.${env.NHOST_REGION || "ap-southeast-1"}.nhost.run/v1`;
  console.log(`   • Nhost Functions Base URL: ${functionsUrl}`);

  try {
    const fnHealth = await fetch(`${functionsUrl}/healthz`, { method: "GET" });
    console.log(`   • Nhost Functions Health status: ${fnHealth.status}`);
  } catch (err) {
    console.log(`   • Nhost Functions probe response: ${(err).message}`);
  }
}

inspectExecutionArchitecture().catch(console.error);
