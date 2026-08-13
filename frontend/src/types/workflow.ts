export type NodeType =
  | "trigger"
  | "ai_agent"
  | "http_request"
  | "database"
  | "condition"
  | "notify"
  | "approval_gate";

export type TriggerConfig = {
  triggerType: "Manual" | "Webhook" | "Schedule";
  webhookSecret?: string;
  webhookPath?: string;
};

export type AIAgentConfig = {
  model: "Gemini" | "OpenAI" | "Claude";
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
  maxTokens: number;
};

export type HTTPRequestConfig = {
  method: "GET" | "POST" | "PUT" | "DELETE";
  url: string;
  headers: string;
  body: string;
};

export type DatabaseConfig = {
  operation: "SELECT" | "INSERT" | "UPDATE" | "DELETE";
  tableName: string;
  query: string;
};

export type ConditionConfig = {
  expression?: string;
  field?: string;
  operator?:
    | "contains"
    | "not_contains"
    | "equals"
    | "not_equals"
    | "starts_with"
    | "ends_with"
    | "greater_than"
    | "less_than"
    | "is_empty"
    | "is_not_empty";
  value?: string;
  trueStepId?: string;
  falseStepId?: string;
  trueBranchStepName?: string;
  falseBranchStepName?: string;
};

export type NotifyConfig = {
  channel: "Email" | "Slack" | "Webhook";
  recipient: string;
  message: string;
};

export type ApprovalGateConfig = {
  message: string;
  requiredRole: "Owner" | "Editor" | "Viewer";
  timeoutHours: number;
};

export type WorkflowNodeConfig = {
  trigger?: TriggerConfig;
  aiAgent?: AIAgentConfig;
  httpRequest?: HTTPRequestConfig;
  database?: DatabaseConfig;
  condition?: ConditionConfig;
  notify?: NotifyConfig;
  approvalGate?: ApprovalGateConfig;
};

export type StepRunStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "skipped"
  | "paused";

export interface StepRun {
  id: string;
  workflow_run_id: string;
  workflow_step_id: string;
  status: StepRunStatus;
  input?: Record<string, unknown> | null;
  output?: Record<string, unknown> | null;
  error?: string | null;
  attempt_count: number;
  approved_by?: string | null;
  approved_at?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  created_at: string;
  workflow_step?: {
    id: string;
    name: string;
    type: string;
    position?: number;
    config?: Record<string, unknown>;
  } | null;
}

export type WorkflowNodeData = {
  label: string;
  icon: string;
  nodeType: NodeType;
  config: WorkflowNodeConfig;
  stepId?: string;
  executionStatus?: StepRunStatus;
  executionError?: string | null;
  liveStepRun?: StepRun;
  userRole?: string | null;
  onApprove?: (stepId?: string, stepRunId?: string) => void;
  [key: string]: unknown;
};

export const DEFAULT_NODE_CONFIGS: Record<
  NodeType,
  { label: string; icon: string; config: WorkflowNodeConfig }
> = {
  trigger: {
    label: "Trigger",
    icon: "⚡",
    config: {
      trigger: {
        triggerType: "Manual",
      },
    },
  },
  ai_agent: {
    label: "AI Agent",
    icon: "🤖",
    config: {
      aiAgent: {
        model: "Gemini",
        systemPrompt: "You are an intelligent AI workflow assistant.",
        userPrompt: "Process the incoming workflow data.",
        temperature: 0.7,
        maxTokens: 2048,
      },
    },
  },
  http_request: {
    label: "HTTP Request",
    icon: "🌐",
    config: {
      httpRequest: {
        method: "GET",
        url: "https://httpbin.org/get",
        headers: '{\n  "Content-Type": "application/json"\n}',
        body: '{\n  "key": "value"\n}',
      },
    },
  },
  database: {
    label: "Database",
    icon: "🗄️",
    config: {
      database: {
        operation: "SELECT",
        tableName: "users",
        query: "SELECT * FROM users WHERE active = true LIMIT 10;",
      },
    },
  },
  condition: {
    label: "Condition",
    icon: "◆",
    config: {
      condition: {
        field: "content",
        operator: "contains",
        value: "APPROVE",
        expression: 'lastOutput.content && lastOutput.content.includes("APPROVE")',
      },
    },
  },
  notify: {
    label: "Notify",
    icon: "📢",
    config: {
      notify: {
        channel: "Email",
        recipient: "team@example.com",
        message: "Workflow executed successfully with output: {{steps.ai_agent.response}}",
      },
    },
  },
  approval_gate: {
    label: "Approval Gate",
    icon: "🛡️",
    config: {
      approvalGate: {
        message: "Please review and approve this workflow step before proceeding.",
        requiredRole: "Owner",
        timeoutHours: 24,
      },
    },
  },
};
