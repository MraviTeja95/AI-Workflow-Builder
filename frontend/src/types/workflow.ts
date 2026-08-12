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
  expression: string;
};

export type NotifyConfig = {
  channel: "Email" | "Slack" | "Webhook";
  recipient: string;
  message: string;
};

export type ApprovalGateConfig = {
  message: string;
  requiredRole: "Owner" | "Admin" | "Member";
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

export type WorkflowNodeData = {
  label: string;
  icon: string;
  nodeType: NodeType;
  config: WorkflowNodeConfig;
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
        url: "https://api.example.com/v1/data",
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
        expression: '{{steps.trigger.data.status}} === "active"',
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
