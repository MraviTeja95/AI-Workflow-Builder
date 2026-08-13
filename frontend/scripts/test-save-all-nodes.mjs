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
        let value = trimmed.slice(idx + 1).trim();
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
        }
        env[key] = value;
      }
    }
  }
  return env;
}

const env = loadEnv();
const subdomain = env.NEXT_PUBLIC_NHOST_SUBDOMAIN || "zggynlwwpraxjmbawiym";
const region = env.NEXT_PUBLIC_NHOST_REGION || "ap-southeast-1";

async function testSaveAllNodes() {
  console.log("1. Authenticating as Owner (admin.a.test@example.com)...");
  const authRes = await fetch(`https://${subdomain}.auth.${region}.nhost.run/v1/signin/email-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "admin.a.test@example.com",
      password: "SecurePassword123!",
    }),
  });

  const authData = await authRes.json();
  const token = authData.session?.accessToken;
  const userId = authData.session?.user?.id;
  console.log("   Auth response status:", authRes.status, "| Token exists:", !!token, "| User ID:", userId);

  if (!token) {
    console.error("   Failed to get token:", authData);
    return;
  }

  console.log("2. Saving workflow with ALL 7 node types...");
  const allNodes = [
    {
      id: "trigger-1",
      type: "workflowNode",
      position: { x: 100, y: 100 },
      data: {
        label: "Webhook Inbound",
        icon: "⚡",
        nodeType: "trigger",
        config: { trigger: { triggerType: "Webhook", webhookSecret: "whsec_test12345" } },
      },
    },
    {
      id: "ai-agent-2",
      type: "workflowNode",
      position: { x: 350, y: 100 },
      data: {
        label: "AI Analyzer",
        icon: "🤖",
        nodeType: "ai_agent",
        config: {
          aiAgent: {
            model: "Gemini",
            systemPrompt: "System",
            userPrompt: "Prompt",
            temperature: 0.7,
            maxTokens: 2048,
          },
        },
      },
    },
    {
      id: "http-3",
      type: "workflowNode",
      position: { x: 600, y: 100 },
      data: {
        label: "HTTP Dispatcher",
        icon: "🌐",
        nodeType: "http_request",
        config: {
          httpRequest: {
            method: "POST",
            url: "http://localhost:3000/api/test-http-target",
            headers: '{"Content-Type": "application/json"}',
            body: '{"test": true}',
          },
        },
      },
    },
    {
      id: "condition-4",
      type: "workflowNode",
      position: { x: 850, y: 100 },
      data: {
        label: "Branch Condition",
        icon: "◆",
        nodeType: "condition",
        config: {
          condition: {
            field: "status",
            operator: "equals",
            value: "200",
          },
        },
      },
    },
    {
      id: "db-5",
      type: "workflowNode",
      position: { x: 1100, y: 100 },
      data: {
        label: "DB Audit Writer",
        icon: "🗄️",
        nodeType: "database",
        config: {
          database: {
            operation: "INSERT",
            tableName: "test_audit_records",
            query: "INSERT INTO test_audit_records (action, payload) VALUES ('test', '{\"ok\": true}');",
          },
        },
      },
    },
    {
      id: "notify-6",
      type: "workflowNode",
      position: { x: 1350, y: 100 },
      data: {
        label: "Notify Slack",
        icon: "📢",
        nodeType: "notify",
        config: {
          notify: {
            channel: "Webhook",
            recipient: "http://localhost:3000/api/test-http-target",
            message: "All completed!",
          },
        },
      },
    },
    {
      id: "gate-7",
      type: "workflowNode",
      position: { x: 1600, y: 100 },
      data: {
        label: "Approval Gate",
        icon: "🛡️",
        nodeType: "approval_gate",
        config: {
          approvalGate: {
            message: "Sign off required",
            requiredRole: "Owner",
            timeoutHours: 24,
          },
        },
      },
    },
  ];

  const allEdges = [
    { id: "e1", source: "trigger-1", target: "ai-agent-2" },
    { id: "e2", source: "ai-agent-2", target: "http-3" },
    { id: "e3", source: "http-3", target: "condition-4" },
    { id: "e4", source: "condition-4", target: "db-5", sourceHandle: "true" },
    { id: "e5", source: "db-5", target: "notify-6" },
    { id: "e6", source: "notify-6", target: "gate-7" },
  ];

  const saveRes = await fetch("http://localhost:3000/api/workflows", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      id: null,
      name: "All 7 Nodes Test Pipeline",
      nodes: allNodes,
      edges: allEdges,
    }),
  });

  console.log("   Save status:", saveRes.status);
  const saveJson = await saveRes.json();
  console.log("   Save response:", saveJson);

  if (saveJson.workflow?.id) {
    const wfId = saveJson.workflow.id;
    console.log("3. Updating existing workflow (ID:", wfId, ")...");
    const updateRes = await fetch("http://localhost:3000/api/workflows", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        id: wfId,
        name: "All 7 Nodes Test Pipeline (Updated)",
        nodes: allNodes.slice(0, 5), // removed 2 nodes
        edges: allEdges.slice(0, 4),
      }),
    });

    console.log("   Update status:", updateRes.status);
    const updateJson = await updateRes.json();
    console.log("   Update response:", updateJson);

    console.log("4. Fetching saved workflow by ID...");
    const getRes = await fetch(`http://localhost:3000/api/workflows/${wfId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    console.log("   GET status:", getRes.status);
    const getJson = await getRes.json();
    console.log("   GET loaded nodes count:", getJson.nodes?.length, "| edges count:", getJson.edges?.length);
  }
}

testSaveAllNodes().catch(console.error);
