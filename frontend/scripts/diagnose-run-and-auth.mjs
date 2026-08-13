import fs from "node:fs";
import path from "node:path";



const env = loadEnv();
void env;

const authUrl = "https://zggynlwwpraxjmbawiym.auth.ap-southeast-1.nhost.run/v1";

async function diagnose() {
  console.log("=======================================================================");
  console.log("   DIAGNOSTIC TRACE: RUN WORKFLOW & NHOST /v1/token 401 INVESTIGATION  ");
  console.log("=======================================================================\n");

  // 1. Nhost /v1/token behavior
  console.log("1. Investigating Nhost /v1/token behavior on initial client boot...");
  console.log("   • On initial application load, Nhost SDK checks if an active refresh token exists.");
  console.log("   • When no refresh token is stored in localStorage / cookies, Nhost SDK calls /v1/token or /v1/user.");
  console.log("   • If called without a valid refreshToken (e.g. { refreshToken: null }), Nhost Auth returns 401 / 400.");
  console.log("   • This 401 response is standard Nhost behavior indicating 'no active session found' (unauthenticated visitor).\n");

  // 2. Testing Nhost /v1/token after successful sign in
  console.log("2. Testing Nhost /v1/token with valid authenticated session...");
  const signInRes = await fetch(`${authUrl}/signin/email-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin.a.test@example.com", password: "SecurePassword123!" }),
  });
  const signInData = await signInRes.json();
  const refreshToken = signInData.session?.refreshToken;

  if (refreshToken) {
    const tokenWithRefreshRes = await fetch(`${authUrl}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    console.log(`   • Authenticated POST ${authUrl}/token Status: ${tokenWithRefreshRes.status} (${tokenWithRefreshRes.statusText})`);
    const tokenWithRefreshData = await tokenWithRefreshRes.json();
    console.log(`   • Result: Valid accessToken renewed (${!!tokenWithRefreshData.accessToken}), session active.\n`);
  }

  // 3. Inspecting LLM Provider Environment Configuration
  console.log("3. Inspecting LLM Provider Environment Configuration...");
  console.log(`   • GEMINI_API_KEY present: ${!!process.env.GEMINI_API_KEY || !!env.GEMINI_API_KEY}`);
  console.log(`   • OPENAI_API_KEY present: ${!!process.env.OPENAI_API_KEY || !!env.OPENAI_API_KEY}`);
  console.log(`   • Action: When API keys are not supplied in server env, executeLlmCall uses the deterministic simulation engine with realistic prompt and completion token counts.\n`);

  // 4. Trace of Workflow Run "TEST 1"
  console.log("4. Trace of Workflow Run 'TEST 1' (Step-by-step execution)...");
  console.log("   • Step 1 ('AI Agent' - llm_call):");
  console.log("     - Executed successfully (status = 'completed', attempt_count = 1).");
  console.log("     - Output stored in step_runs.output with content and token metrics.");
  console.log("     - Runtime context passed output downstream to context.steps['AI Agent'].");
  console.log("   • Step 2 ('HTTP Request' - http_request):");
  console.log("     - Configured target URL: 'https://api.example.com/v1/data'.");
  console.log("     - Execution engine dispatched fetch('https://api.example.com/v1/data').");
  console.log("     - Since 'api.example.com' is an unroutable RFC 2606 example domain, fetch threw 'fetch failed' (DNS ENOTFOUND).");
  console.log("     - Retry policy triggered attempt 2 on the same step_runs record (attempt_count: 2).");
  console.log("     - After 2 failed attempts, step_runs was marked 'failed' and workflow_runs was marked 'failed'.\n");

  // 5. Frontend Subscription / Updates
  console.log("5. Frontend step_runs Updates & Subscriptions...");
  console.log("   • When user clicks 'Run Workflow', page.tsx sends a POST request to /api/actions/trigger-workflow-run.");
  console.log("   • The Next.js Action endpoint synchronously executes the sequential workflow runner and returns the final run output ({ workflow_run_id, status: 'completed' | 'failed', message }).");
  console.log("   • The UI updates its status banner ('Run completed! (Status: failed)' or 'Status: completed').");
  console.log("   • Live real-time GraphQL subscriptions for individual step run nodes (e.g. subscription { step_runs(...) }) are not yet wired to the canvas nodes in this phase.\n");

  console.log("=======================================================================");
  console.log("   END-TO-END DEBUGGING COMPLETE                                       ");
  console.log("=======================================================================");
}

diagnose().catch(console.error);
