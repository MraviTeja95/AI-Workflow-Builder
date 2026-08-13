"use client";

import { useEffect, useState } from "react";
import type { StepRun } from "@/types/workflow";

interface UseWorkflowStepRunsSubscriptionProps {
  workflowRunId: string | null;
  accessToken: string | null;
}

interface UseWorkflowStepRunsSubscriptionReturn {
  stepRuns: StepRun[];
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
}

const SUBSCRIPTION_QUERY = `
  subscription WorkflowStepRuns($workflowRunId: uuid!) {
    step_runs(
      where: { workflow_run_id: { _eq: $workflowRunId } }
      order_by: { created_at: asc }
    ) {
      id
      workflow_run_id
      workflow_step_id
      status
      input
      output
      error
      attempt_count
      approved_by
      approved_at
      started_at
      finished_at
      created_at
      workflow_step {
        id
        name
        type
        position
        config
      }
    }
  }
`;

export function useWorkflowStepRunsSubscription({
  workflowRunId,
  accessToken,
}: UseWorkflowStepRunsSubscriptionProps): UseWorkflowStepRunsSubscriptionReturn {
  const [stepRuns, setStepRuns] = useState<StepRun[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Strict Guard: only connect when BOTH workflowRunId AND accessToken are available
    if (!workflowRunId || !accessToken) {
      return;
    }

    const subdomain =
      process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN || "zggynlwwpraxjmbawiym";
    const region = process.env.NEXT_PUBLIC_NHOST_REGION || "ap-southeast-1";
    const wsUrl = `wss://${subdomain}.hasura.${region}.nhost.run/v1/graphql`;
    const subId = "sub-step-runs";

    let socket: WebSocket | null = null;
    let isDisposed = false;

    // Safe diagnostic log without exposing secret values
    console.log("[GraphQL WS] Initializing connection:", {
      accessTokenExists: !!accessToken,
      tokenLength: accessToken.length,
      workflowRunId,
      wsUrl,
      subprotocol: "graphql-ws",
    });

    try {
      socket = new WebSocket(wsUrl, "graphql-ws");

      socket.onopen = () => {
        if (isDisposed) return;
        setIsConnected(true);

        console.log("[GraphQL WS] Connection open. Sending authenticated connection_init...", {
          readyState: socket?.readyState,
          accessTokenExists: !!accessToken,
        });

        // Send connection_init with authenticated user Bearer token
        socket?.send(
          JSON.stringify({
            type: "connection_init",
            payload: {
              headers: {
                Authorization: `Bearer ${accessToken}`,
              },
            },
          })
        );
      };

      socket.onmessage = (event) => {
        if (isDisposed) return;

        try {
          const msg = JSON.parse(event.data);

          // Connection acknowledged by Hasura -> start subscription
          if (msg.type === "connection_ack") {
            console.log("[GraphQL WS] connection_ack received. Subscribing for run:", workflowRunId);
            socket?.send(
              JSON.stringify({
                id: subId,
                type: "start",
                payload: {
                  query: SUBSCRIPTION_QUERY,
                  variables: { workflowRunId },
                },
              })
            );
          } else if (msg.type === "data") {
            const receivedRuns = msg.payload?.data?.step_runs;
            if (Array.isArray(receivedRuns)) {
              setStepRuns(receivedRuns as StepRun[]);
              setIsLoading(false);
              setError(null);
            }
          } else if (msg.type === "error" || msg.type === "connection_error") {
            const errorMsg =
              msg.payload?.errors?.[0]?.message ||
              msg.payload?.message ||
              (typeof msg.payload === "string"
                ? msg.payload
                : "GraphQL subscription error");

            console.error("[GraphQL WS] Subscription error:", {
              messageType: msg.type,
              error: errorMsg,
            });

            setError(errorMsg);
            setIsLoading(false);
          }
        } catch (err) {
          console.error("[GraphQL WS] Failed to parse message:", err);
        }
      };

      socket.onerror = (evt) => {
        if (isDisposed) return;
        console.error("[GraphQL WS] Connection error event:", {
          readyState: socket?.readyState,
          type: evt.type,
        });
        setError("WebSocket connection failed.");
        setIsConnected(false);
        setIsLoading(false);
      };

      socket.onclose = (evt) => {
        if (isDisposed) return;
        console.log("[GraphQL WS] Connection closed:", {
          code: evt.code,
          reason: evt.reason || "Normal close",
        });
        setIsConnected(false);
      };
    } catch (err) {
      console.error("[GraphQL WS] Init failed:", err);
    }

    return () => {
      isDisposed = true;
      if (socket) {
        try {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(
              JSON.stringify({
                id: subId,
                type: "stop",
              })
            );
          }
          socket.close();
        } catch {
          // Ignore close errors during unmount
        }
      }
    };
  }, [workflowRunId, accessToken]);

  return {
    stepRuns: workflowRunId && accessToken ? stepRuns : [],
    isConnected: workflowRunId && accessToken ? isConnected : false,
    isLoading: workflowRunId && accessToken ? isLoading : false,
    error: workflowRunId && accessToken ? error : null,
  };
}
