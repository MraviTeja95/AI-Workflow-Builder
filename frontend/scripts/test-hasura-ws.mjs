const authUrl = "https://zggynlwwpraxjmbawiym.auth.ap-southeast-1.nhost.run/v1";
const wsUrl = "wss://zggynlwwpraxjmbawiym.hasura.ap-southeast-1.nhost.run/v1/graphql";

async function testWebSocketSubscription() {
  console.log("=======================================================================");
  console.log("   HASURA GRAPHQL WEBSOCKET SUBSCRIPTION TEST                         ");
  console.log("=======================================================================\n");

  // 1. Sign in as Owner A to get a real user JWT token
  console.log("1. Authenticating user to get session JWT...");
  const signInRes = await fetch(`${authUrl}/signin/email-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin.a.test@example.com", password: "SecurePassword123!" }),
  });
  const signInData = await signInRes.json();
  const token = signInData.session?.accessToken;

  if (!token) {
    throw new Error("Failed to authenticate user for WebSocket test!");
  }
  console.log("   • User JWT acquired successfully (length: " + token.length + ")\n");

  // 2. Connect WebSocket using graphql-ws subprotocol
  console.log(`2. Connecting WebSocket to: ${wsUrl}...`);

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl, "graphql-ws");

    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error("WebSocket test timed out after 10s"));
    }, 10000);

    ws.onopen = () => {
      console.log("   • WebSocket Connection Open (subprotocol: " + ws.protocol + ")");
      const initMessage = {
        type: "connection_init",
        payload: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      };
      ws.send(JSON.stringify(initMessage));
      console.log("   • Sent connection_init with Bearer token");
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      console.log("   • Received WS Message:", msg.type);

      if (msg.type === "connection_ack") {
        console.log("   • Connection Acknowledged by Hasura! Starting subscription for step_runs...");
        const subMsg = {
          id: "sub-1",
          type: "start",
          payload: {
            query: `
              subscription WorkflowStepRuns($workflowRunId: uuid!) {
                step_runs(
                  where: { workflow_run_id: { _eq: $workflowRunId } }
                  order_by: { created_at: asc }
                ) {
                  id
                  workflow_run_id
                  workflow_step_id
                  status
                  attempt_count
                }
              }
            `,
            variables: {
              workflowRunId: "cb2605ea-5a6a-4e67-ac28-d435426c4be8",
            },
          },
        };
        ws.send(JSON.stringify(subMsg));
        console.log("   • Sent subscription 'start' message");
      } else if (msg.type === "data") {
        console.log("   • SUBSCRIPTION DATA RECEIVED! Records count:", msg.payload?.data?.step_runs?.length);
        console.log("   • Data Sample:", JSON.stringify(msg.payload?.data?.step_runs));
        clearTimeout(timeout);
        ws.send(JSON.stringify({ id: "sub-1", type: "stop" }));
        ws.close();
        resolve(true);
      } else if (msg.type === "error" || msg.type === "connection_error") {
        console.error("   ✗ WS Error:", msg);
        clearTimeout(timeout);
        ws.close();
        reject(new Error("WS Subscription error: " + JSON.stringify(msg)));
      }
    };

    ws.onerror = (err) => {
      console.error("   ✗ WebSocket Error:", err);
      clearTimeout(timeout);
      reject(err);
    };
  });
}

testWebSocketSubscription()
  .then(() => {
    console.log("\n🎉 WEBSOCKET SUBSCRIPTION VERIFIED WORKING 100%!");
  })
  .catch((err) => {
    console.error("Test failed:", err);
    process.exit(1);
  });
