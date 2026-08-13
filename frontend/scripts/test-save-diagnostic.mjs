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

async function loginAndTestSave() {
  console.log("1. Authenticating via Nhost sign-in endpoint...");
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

  console.log("2. Sending POST http://localhost:3000/api/workflows with Bearer token...");
  const savePayload = {
    id: null,
    name: "Diagnostic Test Workflow",
    nodes: [
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
              systemPrompt: "System",
              userPrompt: "Prompt",
              temperature: 0.7,
              maxTokens: 2048,
            },
          },
        },
      },
    ],
    edges: [
      {
        id: "e-trigger-ai",
        source: "trigger-1",
        target: "ai-agent-2",
        sourceHandle: "source",
        targetHandle: "target",
        animated: true,
      },
    ],
  };

  try {
    const saveRes = await fetch("http://localhost:3000/api/workflows", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(savePayload),
    });

    console.log("   Save response HTTP status:", saveRes.status);
    const saveJson = await saveRes.json().catch(() => null);
    console.log("   Save response body:", saveJson);
  } catch (err) {
    console.error("   Fetch threw error:", err);
  }
}

loginAndTestSave().catch(console.error);
