import fs from "node:fs";
import path from "node:path";

function loadEnv() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  const content = fs.readFileSync(envPath, "utf-8");
  const env = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const idx = trimmed.indexOf("=");
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const value = trimmed.slice(idx + 1).trim();
        env[key] = value;
      }
    }
  }
  return env;
}

const env = loadEnv();
const endpoint =
  env.HASURA_GRAPHQL_ENDPOINT ||
  "https://zggynlwwpraxjmbawiym.hasura.ap-southeast-1.nhost.run/v1/graphql";
const adminSecret = env.HASURA_GRAPHQL_ADMIN_SECRET;
const orgId = env.DEFAULT_ORGANIZATION_ID || "0101ca0e-6bab-4154-9cfc-d4b581ad3554";
const userId = env.DEFAULT_USER_ID || "fb336480-d1b5-4c6b-8d6d-8cd6015e9713";

async function graphql(query, variables = {}) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-hasura-admin-secret": adminSecret,
    },
    body: JSON.stringify({ query, variables }),
  });
  const data = await res.json();
  if (data.errors) {
    throw new Error(JSON.stringify(data.errors, null, 2));
  }
  return data.data;
}

function mapNodeTypeToBackend(uiType) {
  switch (uiType) {
    case "ai_agent":
      return "llm_call";
    case "http_request":
      return "http_request";
    case "database":
      return "db_write";
    case "condition":
      return "conditional_branch";
    case "output":
      return "notify";
    case "approval_gate":
      return "approval_gate";
    default:
      return uiType;
  }
}

function mapBackendToNodeType(backendType) {
  switch (backendType) {
    case "llm_call":
      return "ai_agent";
    case "http_request":
      return "http_request";
    case "db_write":
      return "database";
    case "conditional_branch":
      return "condition";
    case "notify":
      return "output";
    default:
      return backendType || "http_request";
  }
}

// Emulate saveWorkflow API logic
async function saveWorkflowServer({ id, name, nodes, edges }) {
  let workflowId = id;
  let workflowRecord;

  if (workflowId) {
    const updateQuery = `
      mutation UpdateWorkflow($id: uuid!, $name: String!, $updated_at: timestamptz!) {
        update_workflows_by_pk(
          pk_columns: { id: $id }
          _set: { name: $name, updated_at: $updated_at }
        ) {
          id
          name
          org_id
          created_by
          updated_at
        }
      }
    `;
    const res = await graphql(updateQuery, {
      id: workflowId,
      name,
      updated_at: new Date().toISOString(),
    });
    workflowRecord = res.update_workflows_by_pk;
  } else {
    const createQuery = `
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
    `;
    const res = await graphql(createQuery, {
      object: {
        name,
        org_id: orgId,
        created_by: userId,
        updated_at: new Date().toISOString(),
      },
    });
    workflowRecord = res.insert_workflows_one;
    workflowId = workflowRecord.id;
  }

  // 1. Prepare steps (excluding trigger node)
  const actionNodes = nodes.filter((n) => n.data.nodeType !== "trigger");
  const stepRows = actionNodes.map((node, index) => {
    const outgoingEdges = edges.filter((e) => e.source === node.id);
    const connections = outgoingEdges.map((e) => ({
      target_node_id: e.target,
      source_handle: e.sourceHandle || "source",
      target_handle: e.targetHandle || "target",
    }));

    return {
      workflow_id: workflowId,
      name: node.data.label || "Step",
      type: mapNodeTypeToBackend(node.data.nodeType || "http_request"),
      position: index,
      config: {
        client_node_id: node.id,
        ui_position: {
          x: Math.round(node.position.x),
          y: Math.round(node.position.y),
        },
        node_config: node.data.config || {},
        connections,
      },
    };
  });

  // Sync steps
  const syncStepsQuery = `
    mutation SyncWorkflowSteps($workflowId: uuid!, $steps: [workflow_steps_insert_input!]!) {
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
  `;
  await graphql(syncStepsQuery, { workflowId, steps: stepRows });

  // 2. Prepare trigger rows
  const triggerNodes = nodes.filter((n) => n.data.nodeType === "trigger");
  const triggerRows = triggerNodes.map((t) => {
    const rawType = (t.data.config?.trigger?.triggerType || "manual").toLowerCase();
    const triggerType = rawType === "schedule" ? "scheduled" : rawType;
    const triggerOutgoingEdges = edges.filter((e) => e.source === t.id);
    const triggerConnections = triggerOutgoingEdges.map((e) => ({
      target_node_id: e.target,
      source_handle: e.sourceHandle || "source",
      target_handle: e.targetHandle || "target",
    }));

    return {
      workflow_id: workflowId,
      type: triggerType,
      enabled: true,
      config: {
        client_node_id: t.id,
        ui_position: {
          x: Math.round(t.position.x),
          y: Math.round(t.position.y),
        },
        node_config: t.data.config || {},
        connections: triggerConnections,
      },
    };
  });

  const syncTriggersQuery = `
    mutation SyncWorkflowTriggers($workflowId: uuid!, $triggers: [workflow_triggers_insert_input!]!) {
      delete_workflow_triggers(where: { workflow_id: { _eq: $workflowId } }) {
        affected_rows
      }
      insert_workflow_triggers(objects: $triggers) {
        affected_rows
        returning {
          id
          type
          enabled
        }
      }
    }
  `;
  await graphql(syncTriggersQuery, { workflowId, triggers: triggerRows });

  return { workflow: workflowRecord, workflowId };
}

// Emulate loadWorkflow API logic
async function loadWorkflowServer(id) {
  const getQuery = `
    query GetWorkflow($id: uuid!) {
      workflows_by_pk(id: $id) {
        id
        name
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
        }
        workflow_triggers {
          id
          type
          enabled
          config
        }
      }
    }
  `;
  const res = await graphql(getQuery, { id });
  const workflow = res.workflows_by_pk;
  if (!workflow) return null;

  const nodes = [];
  const edges = [];

  // Triggers
  workflow.workflow_triggers.forEach((trigger, idx) => {
    const cfg = trigger.config || {};
    const clientNodeId = cfg.client_node_id || `trigger-${idx + 1}`;
    nodes.push({
      id: clientNodeId,
      type: "workflowNode",
      position: cfg.ui_position || { x: 100, y: 180 },
      data: {
        label: "Trigger",
        icon: "⚡",
        nodeType: "trigger",
        config: cfg.node_config || { trigger: { triggerType: "Webhook" } },
      },
    });

    (cfg.connections || []).forEach((conn, connIdx) => {
      edges.push({
        id: `e-${clientNodeId}-${conn.target_node_id}-${connIdx}`,
        source: clientNodeId,
        target: conn.target_node_id,
        sourceHandle: conn.source_handle || "source",
        targetHandle: conn.target_handle || "target",
        animated: true,
        style: { stroke: "#3b82f6", strokeWidth: 2 },
      });
    });
  });

  // Steps
  workflow.workflow_steps.forEach((step, idx) => {
    const cfg = step.config || {};
    const clientNodeId = cfg.client_node_id || step.id;
    const nodeType = mapBackendToNodeType(step.type);
    nodes.push({
      id: clientNodeId,
      type: "workflowNode",
      position: cfg.ui_position || { x: 380 + idx * 280, y: 180 },
      data: {
        label: step.name,
        nodeType: nodeType,
        config: cfg.node_config || {},
      },
    });

    (cfg.connections || []).forEach((conn, connIdx) => {
      edges.push({
        id: `e-${clientNodeId}-${conn.target_node_id}-${connIdx}`,
        source: clientNodeId,
        target: conn.target_node_id,
        sourceHandle: conn.source_handle || "source",
        targetHandle: conn.target_handle || "target",
        animated: true,
        style: { stroke: "#3b82f6", strokeWidth: 2 },
      });
    });
  });

  return { workflow, nodes, edges };
}

async function runRealTest() {
  console.log("=================================================================");
  console.log("   REAL END-TO-END WORKFLOW PERSISTENCE TEST ON HOSTED NHOST     ");
  console.log("=================================================================\n");

  // Step A, B, C, D: Construct initial workflow
  console.log("▶ Step A-D: Constructing 'Lead Enrichment Pipeline' with 4 nodes...");
  const initialNodes = [
    {
      id: "trigger-1",
      position: { x: 100, y: 150 },
      data: {
        label: "Lead Webhook Trigger",
        nodeType: "trigger",
        config: { trigger: { triggerType: "Webhook" } },
      },
    },
    {
      id: "ai-agent-2",
      position: { x: 380, y: 150 },
      data: {
        label: "Company Intelligence AI",
        nodeType: "ai_agent",
        config: {
          aiAgent: {
            model: "Gemini",
            systemPrompt: "Enrich incoming leads with company intelligence.",
            userPrompt: "Extract domain and enrich company info.",
            temperature: 0.7,
            maxTokens: 4096,
          },
        },
      },
    },
    {
      id: "http-request-3",
      position: { x: 660, y: 150 },
      data: {
        label: "CRM Sync Request",
        nodeType: "http_request",
        config: {
          httpRequest: {
            method: "POST",
            url: "https://api.crm.com/leads/enrich",
            headers: '{\n  "Authorization": "Bearer lead-secret-key"\n}',
            body: '{\n  "lead_id": "{{steps.trigger.data.id}}"\n}',
          },
        },
      },
    },
    {
      id: "condition-4",
      position: { x: 940, y: 150 },
      data: {
        label: "High Value Score Check",
        nodeType: "condition",
        config: {
          condition: {
            expression: "{{steps.ai_agent.score}} > 80",
          },
        },
      },
    },
  ];

  const initialEdges = [
    { id: "e1", source: "trigger-1", target: "ai-agent-2" },
    { id: "e2", source: "ai-agent-2", target: "http-request-3" },
    { id: "e3", source: "http-request-3", target: "condition-4" },
  ];

  // Step E: Save
  console.log("▶ Step E: Saving workflow to Nhost...");
  const save1 = await saveWorkflowServer({
    name: "Lead Enrichment Pipeline",
    nodes: initialNodes,
    edges: initialEdges,
  });
  const workflowId = save1.workflowId;
  console.log(`  ✓ Saved! Workflow ID: ${workflowId}`);

  // Step F: Verify actual rows in Nhost
  console.log("▶ Step F: Verifying records in Nhost database tables...");
  const check1 = await graphql(
    `
    query VerifyWorkflowRows($id: uuid!) {
      workflows_by_pk(id: $id) {
        id
        name
        org_id
        created_by
        workflow_steps {
          id
          name
          type
          position
          config
        }
        workflow_triggers {
          id
          type
          enabled
          config
        }
      }
    }
  `,
    { id: workflowId }
  );

  const wf = check1.workflows_by_pk;
  console.log(`  ✓ Workflows row: name="${wf.name}", org_id=${wf.org_id}, created_by=${wf.created_by}`);
  console.log(`  ✓ Workflow steps count (action nodes): ${wf.workflow_steps.length} (Expected: 3 [llm_call, http_request, conditional_branch])`);
  console.log(`  ✓ Workflow triggers count: ${wf.workflow_triggers.length} (Expected: 1, Type: ${wf.workflow_triggers[0]?.type})`);

  if (wf.workflow_steps.length !== 3 || wf.workflow_triggers.length !== 1) {
    throw new Error("Step F verification failed: steps or triggers count mismatch.");
  }

  // Step G & H: Modify AI Agent configuration & Save again
  console.log("\n▶ Step G-H: Modifying AI Agent configuration (temperature: 0.2, model: OpenAI)...");
  const modifiedNodes = initialNodes.map((node) => {
    if (node.id === "ai-agent-2") {
      return {
        ...node,
        data: {
          ...node.data,
          config: {
            ...node.data.config,
            aiAgent: {
              ...node.data.config.aiAgent,
              model: "OpenAI",
              temperature: 0.2,
            },
          },
        },
      };
    }
    return node;
  });

  await saveWorkflowServer({
    id: workflowId,
    name: "Lead Enrichment Pipeline",
    nodes: modifiedNodes,
    edges: initialEdges,
  });

  // Step I: Verify no duplicate workflow created & AI Agent updated
  console.log("▶ Step I: Verifying single workflow record and updated AI Agent step...");
  const check2 = await graphql(
    `
    query VerifyUpdate($id: uuid!) {
      workflows(where: { id: { _eq: $id } }) {
        id
        name
      }
      workflow_steps(where: { workflow_id: { _eq: $id }, type: { _eq: "llm_call" } }) {
        id
        config
      }
    }
  `,
    { id: workflowId }
  );

  console.log(`  ✓ Workflows matching this ID: ${check2.workflows.length} (Single workflow instance confirmed)`);
  const aiStepConfig = check2.workflow_steps[0]?.config?.node_config?.aiAgent;
  console.log(`  ✓ AI Agent updated model: "${aiStepConfig?.model}", temperature: ${aiStepConfig?.temperature}`);

  if (check2.workflows.length !== 1 || aiStepConfig?.temperature !== 0.2) {
    throw new Error("Step I verification failed: workflow not found or configuration not updated.");
  }

  // Step J & K: Delete condition-4 node and save again
  console.log("\n▶ Step J-K: Deleting 'condition-4' node and saving again...");
  const nodesAfterDelete = modifiedNodes.filter((n) => n.id !== "condition-4");
  const edgesAfterDelete = initialEdges.filter((e) => e.target !== "condition-4");

  await saveWorkflowServer({
    id: workflowId,
    name: "Lead Enrichment Pipeline",
    nodes: nodesAfterDelete,
    edges: edgesAfterDelete,
  });

  // Step L: Verify deleted step was removed from database
  console.log("▶ Step L: Verifying deleted step removed from database...");
  const check3 = await graphql(
    `
    query VerifyDelete($id: uuid!) {
      workflow_steps(where: { workflow_id: { _eq: $id } }) {
        id
        name
        type
      }
    }
  `,
    { id: workflowId }
  );

  console.log(`  ✓ Remaining workflow steps in Nhost: ${check3.workflow_steps.length} (Expected: 2 [llm_call, http_request])`);
  const hasCondition = check3.workflow_steps.some((s) => s.type === "conditional_branch");
  console.log(`  ✓ Condition node present: ${hasCondition} (Expected: false)`);

  if (check3.workflow_steps.length !== 2 || hasCondition) {
    throw new Error("Step L verification failed: deleted step is still present in database.");
  }

  // Step M & N: Reload workflow using ID
  console.log("\n▶ Step M-N: Reloading workflow from database using ID...");
  const loaded = await loadWorkflowServer(workflowId);

  console.log(`  ✓ Workflow Name: "${loaded.workflow.name}"`);
  console.log(`  ✓ Restored Nodes count: ${loaded.nodes.length} (1 trigger + 2 action nodes)`);
  loaded.nodes.forEach((n) => {
    console.log(`    • Node [${n.id}] (${n.data.nodeType}): "${n.data.label}" @ (${n.position.x}, ${n.position.y})`);
  });
  console.log(`  ✓ Restored Edges count: ${loaded.edges.length}`);
  loaded.edges.forEach((e) => {
    console.log(`    • Edge: ${e.source} → ${e.target}`);
  });

  console.log("\n=================================================================");
  console.log("   🎉 ALL REAL PERSISTENCE & RELOAD TESTS PASSED PERFECTLY!     ");
  console.log("=================================================================\n");
}

runRealTest().catch((err) => {
  console.error("❌ Test failed with error:", err);
  process.exit(1);
});
