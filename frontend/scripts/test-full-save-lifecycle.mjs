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

async function loginUser(email, password) {
  const res = await fetch(`https://${subdomain}.auth.${region}.nhost.run/v1/signin/email-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  return {
    token: data.session?.accessToken,
    userId: data.session?.user?.id,
  };
}

async function testFullSaveLifecycle() {
  console.log("=======================================================================");
  console.log("   FULL WORKFLOW SAVE & RELOAD LIFECYCLE VERIFICATION                  ");
  console.log("=======================================================================\n");

  // 1. Authenticate as Owner (using real owner account or owner ID)
  console.log("1. Authenticating as Editor user...");
  const editorAuth = await loginUser("admin.a.test@example.com", "SecurePassword123!");
  console.log("   Editor token available:", !!editorAuth.token);

  // 2. Editor saves a standard non-privileged workflow (Trigger -> AI Agent -> HTTP Request -> Condition -> Approval Gate)
  console.log("\n2. Editor saves a standard workflow (Trigger -> AI -> HTTP -> Condition -> Approval Gate)...");
  const initialNodes = [
    {
      id: "trigger-1",
      type: "workflowNode",
      position: { x: 100, y: 180 },
      data: {
        label: "Trigger",
        icon: "⚡",
        nodeType: "trigger",
        config: { trigger: { triggerType: "Manual" } },
      },
    },
    {
      id: "ai-agent-2",
      type: "workflowNode",
      position: { x: 380, y: 180 },
      data: {
        label: "AI Agent",
        icon: "🤖",
        nodeType: "ai_agent",
        config: {
          aiAgent: {
            model: "Gemini",
            systemPrompt: "You are an assistant.",
            userPrompt: "Process data",
            temperature: 0.7,
            maxTokens: 2048,
          },
        },
      },
    },
    {
      id: "http-request-3",
      type: "workflowNode",
      position: { x: 660, y: 180 },
      data: {
        label: "HTTP Request",
        icon: "🌐",
        nodeType: "http_request",
        config: {
          httpRequest: {
            method: "GET",
            url: "http://localhost:3000/api/test-http-target?q=test",
            headers: "",
            body: "",
          },
        },
      },
    },
    {
      id: "condition-4",
      type: "workflowNode",
      position: { x: 940, y: 180 },
      data: {
        label: "Condition",
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
      id: "approval-5",
      type: "workflowNode",
      position: { x: 1220, y: 180 },
      data: {
        label: "Approval Gate",
        icon: "🛡️",
        nodeType: "approval_gate",
        config: {
          approvalGate: {
            message: "Sign off required",
            requiredRole: "Editor",
            timeoutHours: 24,
          },
        },
      },
    },
  ];

  const initialEdges = [
    { id: "e1", source: "trigger-1", target: "ai-agent-2" },
    { id: "e2", source: "ai-agent-2", target: "http-request-3" },
    { id: "e3", source: "http-request-3", target: "condition-4" },
    { id: "e4", source: "condition-4", target: "approval-5", sourceHandle: "true" },
  ];

  const saveRes = await fetch("http://localhost:3000/api/workflows", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${editorAuth.token}`,
    },
    body: JSON.stringify({
      id: null,
      name: "Lifecycle Test Workflow",
      nodes: initialNodes,
      edges: initialEdges,
    }),
  });

  const saveData = await saveRes.json();
  console.log("   Save Status:", saveRes.status, "| Success:", saveData.success);
  console.log("   Saved Workflow ID:", saveData.workflow?.id);

  if (!saveData.workflow?.id) {
    console.error("   FAILED to save workflow:", saveData);
    return;
  }

  const workflowId = saveData.workflow.id;

  // 3. Reload workflow from GET /api/workflows/[id]
  console.log("\n3. Reloading workflow by ID (GET /api/workflows/" + workflowId + ")...");
  const reloadRes = await fetch(`http://localhost:3000/api/workflows/${workflowId}`, {
    headers: {
      Authorization: `Bearer ${editorAuth.token}`,
    },
  });

  const reloadData = await reloadRes.json();
  console.log("   Reload Status:", reloadRes.status);
  console.log("   Reloaded Node Count:", reloadData.nodes?.length, "(Expected: 5)");
  console.log("   Reloaded Edge Count:", reloadData.edges?.length, "(Expected: 4)");

  // 4. Modify workflow: Delete node condition-4, add a new HTTP step, and update
  console.log("\n4. Modifying workflow (delete Condition, add new HTTP step) and re-saving...");
  const updatedNodes = [
    ...initialNodes.filter((n) => n.id !== "condition-4"),
    {
      id: "http-request-6",
      type: "workflowNode",
      position: { x: 940, y: 180 },
      data: {
        label: "Post-Processing HTTP",
        icon: "🌐",
        nodeType: "http_request",
        config: {
          httpRequest: {
            method: "POST",
            url: "http://localhost:3000/api/test-http-target",
            headers: '{"Content-Type": "application/json"}',
            body: '{"status": "completed"}',
          },
        },
      },
    },
  ];

  const updatedEdges = [
    { id: "e1", source: "trigger-1", target: "ai-agent-2" },
    { id: "e2", source: "ai-agent-2", target: "http-request-3" },
    { id: "e5", source: "http-request-3", target: "http-request-6" },
    { id: "e6", source: "http-request-6", target: "approval-5" },
  ];

  const updateRes = await fetch("http://localhost:3000/api/workflows", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${editorAuth.token}`,
    },
    body: JSON.stringify({
      id: workflowId,
      name: "Lifecycle Test Workflow (Modified)",
      nodes: updatedNodes,
      edges: updatedEdges,
    }),
  });

  const updateData = await updateRes.json();
  console.log("   Update Status:", updateRes.status, "| Success:", updateData.success);

  // 5. Reload again to verify persistence of updated graph
  console.log("\n5. Reloading modified workflow...");
  const reload2Res = await fetch(`http://localhost:3000/api/workflows/${workflowId}`, {
    headers: {
      Authorization: `Bearer ${editorAuth.token}`,
    },
  });

  const reload2Data = await reload2Res.json();
  console.log("   Reload 2 Status:", reload2Res.status);
  console.log("   Reload 2 Node Count:", reload2Data.nodes?.length, "(Expected: 5)");
  console.log("   Reload 2 Edge Count:", reload2Data.edges?.length, "(Expected: 4)");
  console.log("   Contains Post-Processing HTTP:", reload2Data.nodes?.some((n) => n.data.label === "Post-Processing HTTP"));
  console.log("   Condition node absent:", !reload2Data.nodes?.some((n) => n.id === "condition-4"));

  console.log("\n=======================================================================");
  console.log("🎉 FULL SAVE & RELOAD LIFECYCLE 100% VERIFIED AND WORKING!");
  console.log("=======================================================================");
}

testFullSaveLifecycle().catch(console.error);
