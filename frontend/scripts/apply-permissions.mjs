import fs from "node:fs";
import path from "node:path";



const env = loadEnv();
void env;

const metadataUrl = "https://zggynlwwpraxjmbawiym.hasura.ap-southeast-1.nhost.run/v1/metadata";
const adminSecret = env.HASURA_GRAPHQL_ADMIN_SECRET;

async function applyPermissionsWithRuns() {
  const tables = [
    "organizations",
    "org_members",
    "workflows",
    "workflow_steps",
    "workflow_triggers",
    "workflow_runs",
    "step_runs",
  ];

  for (const table of tables) {
    for (const type of ["select", "insert", "update", "delete"]) {
      await fetch(metadataUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-hasura-admin-secret": adminSecret },
        body: JSON.stringify({
          type: `pg_drop_${type}_permission`,
          args: {
            source: "default",
            table: { schema: "public", name: table },
            role: "user",
          },
        }),
      });
    }
  }

  const permissionRules = [
    // 1. ORGANIZATIONS
    {
      type: "pg_create_select_permission",
      args: {
        source: "default",
        table: { schema: "public", name: "organizations" },
        role: "user",
        permission: {
          columns: ["id", "name", "quota_limit", "quota_period_start", "quota_used", "created_at"],
          filter: {
            org_members: {
              user_id: { _eq: "X-Hasura-User-Id" },
            },
          },
        },
      },
    },
    {
      type: "pg_create_update_permission",
      args: {
        source: "default",
        table: { schema: "public", name: "organizations" },
        role: "user",
        permission: {
          columns: ["name"],
          filter: {
            org_members: {
              _and: [
                { user_id: { _eq: "X-Hasura-User-Id" } },
                { role: { _in: ["owner", "editor"] } },
              ],
            },
          },
          check: {
            org_members: {
              _and: [
                { user_id: { _eq: "X-Hasura-User-Id" } },
                { role: { _in: ["owner", "editor"] } },
              ],
            },
          },
        },
      },
    },

    // 2. ORG_MEMBERS
    {
      type: "pg_create_select_permission",
      args: {
        source: "default",
        table: { schema: "public", name: "org_members" },
        role: "user",
        permission: {
          columns: ["id", "org_id", "user_id", "role", "created_at"],
          filter: {
            organization: {
              org_members: {
                user_id: { _eq: "X-Hasura-User-Id" },
              },
            },
          },
        },
      },
    },
    {
      type: "pg_create_insert_permission",
      args: {
        source: "default",
        table: { schema: "public", name: "org_members" },
        role: "user",
        permission: {
          columns: ["org_id", "user_id", "role"],
          check: {
            organization: {
              org_members: {
                _and: [
                  { user_id: { _eq: "X-Hasura-User-Id" } },
                  { role: { _eq: "owner" } },
                ],
              },
            },
          },
        },
      },
    },
    {
      type: "pg_create_update_permission",
      args: {
        source: "default",
        table: { schema: "public", name: "org_members" },
        role: "user",
        permission: {
          columns: ["role"],
          filter: {
            organization: {
              org_members: {
                _and: [
                  { user_id: { _eq: "X-Hasura-User-Id" } },
                  { role: { _eq: "owner" } },
                ],
              },
            },
          },
          check: {
            organization: {
              org_members: {
                _and: [
                  { user_id: { _eq: "X-Hasura-User-Id" } },
                  { role: { _eq: "owner" } },
                ],
              },
            },
          },
        },
      },
    },
    {
      type: "pg_create_delete_permission",
      args: {
        source: "default",
        table: { schema: "public", name: "org_members" },
        role: "user",
        permission: {
          filter: {
            organization: {
              org_members: {
                _and: [
                  { user_id: { _eq: "X-Hasura-User-Id" } },
                  { role: { _eq: "owner" } },
                ],
              },
            },
          },
        },
      },
    },

    // 3. WORKFLOWS
    {
      type: "pg_create_select_permission",
      args: {
        source: "default",
        table: { schema: "public", name: "workflows" },
        role: "user",
        permission: {
          columns: ["id", "org_id", "name", "description", "created_by", "created_at", "updated_at"],
          filter: {
            organization: {
              org_members: {
                user_id: { _eq: "X-Hasura-User-Id" },
              },
            },
          },
        },
      },
    },
    {
      type: "pg_create_insert_permission",
      args: {
        source: "default",
        table: { schema: "public", name: "workflows" },
        role: "user",
        permission: {
          columns: ["id", "org_id", "name", "description", "updated_at"],
          set: {
            created_by: "X-Hasura-User-Id",
          },
          check: {
            organization: {
              org_members: {
                _and: [
                  { user_id: { _eq: "X-Hasura-User-Id" } },
                  { role: { _in: ["owner", "editor"] } },
                ],
              },
            },
          },
        },
      },
    },
    {
      type: "pg_create_update_permission",
      args: {
        source: "default",
        table: { schema: "public", name: "workflows" },
        role: "user",
        permission: {
          columns: ["name", "description", "updated_at"],
          filter: {
            organization: {
              org_members: {
                _and: [
                  { user_id: { _eq: "X-Hasura-User-Id" } },
                  { role: { _in: ["owner", "editor"] } },
                ],
              },
            },
          },
          check: {
            organization: {
              org_members: {
                _and: [
                  { user_id: { _eq: "X-Hasura-User-Id" } },
                  { role: { _in: ["owner", "editor"] } },
                ],
              },
            },
          },
        },
      },
    },
    {
      type: "pg_create_delete_permission",
      args: {
        source: "default",
        table: { schema: "public", name: "workflows" },
        role: "user",
        permission: {
          filter: {
            organization: {
              org_members: {
                _and: [
                  { user_id: { _eq: "X-Hasura-User-Id" } },
                  { role: { _eq: "owner" } },
                ],
              },
            },
          },
        },
      },
    },

    // 4. WORKFLOW_STEPS
    {
      type: "pg_create_select_permission",
      args: {
        source: "default",
        table: { schema: "public", name: "workflow_steps" },
        role: "user",
        permission: {
          columns: ["id", "workflow_id", "name", "type", "position", "config", "created_at", "updated_at"],
          filter: {
            workflow: {
              organization: {
                org_members: {
                  user_id: { _eq: "X-Hasura-User-Id" },
                },
              },
            },
          },
        },
      },
    },
    {
      type: "pg_create_insert_permission",
      args: {
        source: "default",
        table: { schema: "public", name: "workflow_steps" },
        role: "user",
        permission: {
          columns: ["id", "workflow_id", "name", "type", "position", "config", "updated_at"],
          check: {
            _or: [
              {
                workflow: {
                  organization: {
                    org_members: {
                      _and: [
                        { user_id: { _eq: "X-Hasura-User-Id" } },
                        { role: { _eq: "owner" } },
                      ],
                    },
                  },
                },
              },
              {
                _and: [
                  { type: { _nin: ["db_write", "notify"] } },
                  {
                    workflow: {
                      organization: {
                        org_members: {
                          _and: [
                            { user_id: { _eq: "X-Hasura-User-Id" } },
                            { role: { _eq: "editor" } },
                          ],
                        },
                      },
                    },
                  },
                ],
              },
            ],
          },
        },
      },
    },
    {
      type: "pg_create_update_permission",
      args: {
        source: "default",
        table: { schema: "public", name: "workflow_steps" },
        role: "user",
        permission: {
          columns: ["name", "type", "position", "config", "updated_at"],
          filter: {
            _or: [
              {
                workflow: {
                  organization: {
                    org_members: {
                      _and: [
                        { user_id: { _eq: "X-Hasura-User-Id" } },
                        { role: { _eq: "owner" } },
                      ],
                    },
                  },
                },
              },
              {
                _and: [
                  { type: { _nin: ["db_write", "notify"] } },
                  {
                    workflow: {
                      organization: {
                        org_members: {
                          _and: [
                            { user_id: { _eq: "X-Hasura-User-Id" } },
                            { role: { _eq: "editor" } },
                          ],
                        },
                      },
                    },
                  },
                ],
              },
            ],
          },
          check: {
            _or: [
              {
                workflow: {
                  organization: {
                    org_members: {
                      _and: [
                        { user_id: { _eq: "X-Hasura-User-Id" } },
                        { role: { _eq: "owner" } },
                      ],
                    },
                  },
                },
              },
              {
                _and: [
                  { type: { _nin: ["db_write", "notify"] } },
                  {
                    workflow: {
                      organization: {
                        org_members: {
                          _and: [
                            { user_id: { _eq: "X-Hasura-User-Id" } },
                            { role: { _eq: "editor" } },
                          ],
                        },
                      },
                    },
                  },
                ],
              },
            ],
          },
        },
      },
    },
    {
      type: "pg_create_delete_permission",
      args: {
        source: "default",
        table: { schema: "public", name: "workflow_steps" },
        role: "user",
        permission: {
          filter: {
            workflow: {
              organization: {
                org_members: {
                  _and: [
                    { user_id: { _eq: "X-Hasura-User-Id" } },
                    { role: { _in: ["owner", "editor"] } },
                  ],
                },
              },
            },
          },
        },
      },
    },

    // 5. WORKFLOW_TRIGGERS
    {
      type: "pg_create_select_permission",
      args: {
        source: "default",
        table: { schema: "public", name: "workflow_triggers" },
        role: "user",
        permission: {
          columns: ["id", "workflow_id", "type", "enabled", "config", "created_at"],
          filter: {
            workflow: {
              organization: {
                org_members: {
                  user_id: { _eq: "X-Hasura-User-Id" },
                },
              },
            },
          },
        },
      },
    },
    {
      type: "pg_create_insert_permission",
      args: {
        source: "default",
        table: { schema: "public", name: "workflow_triggers" },
        role: "user",
        permission: {
          columns: ["id", "workflow_id", "type", "enabled", "config"],
          check: {
            _or: [
              {
                workflow: {
                  organization: {
                    org_members: {
                      _and: [
                        { user_id: { _eq: "X-Hasura-User-Id" } },
                        { role: { _eq: "owner" } },
                      ],
                    },
                  },
                },
              },
              {
                _and: [
                  { type: { _neq: "webhook" } },
                  {
                    workflow: {
                      organization: {
                        org_members: {
                          _and: [
                            { user_id: { _eq: "X-Hasura-User-Id" } },
                            { role: { _eq: "editor" } },
                          ],
                        },
                      },
                    },
                  },
                ],
              },
            ],
          },
        },
      },
    },
    {
      type: "pg_create_update_permission",
      args: {
        source: "default",
        table: { schema: "public", name: "workflow_triggers" },
        role: "user",
        permission: {
          columns: ["type", "enabled", "config"],
          filter: {
            _or: [
              {
                workflow: {
                  organization: {
                    org_members: {
                      _and: [
                        { user_id: { _eq: "X-Hasura-User-Id" } },
                        { role: { _eq: "owner" } },
                      ],
                    },
                  },
                },
              },
              {
                _and: [
                  { type: { _neq: "webhook" } },
                  {
                    workflow: {
                      organization: {
                        org_members: {
                          _and: [
                            { user_id: { _eq: "X-Hasura-User-Id" } },
                            { role: { _eq: "editor" } },
                          ],
                        },
                      },
                    },
                  },
                ],
              },
            ],
          },
          check: {
            _or: [
              {
                workflow: {
                  organization: {
                    org_members: {
                      _and: [
                        { user_id: { _eq: "X-Hasura-User-Id" } },
                        { role: { _eq: "owner" } },
                      ],
                    },
                  },
                },
              },
              {
                _and: [
                  { type: { _neq: "webhook" } },
                  {
                    workflow: {
                      organization: {
                        org_members: {
                          _and: [
                            { user_id: { _eq: "X-Hasura-User-Id" } },
                            { role: { _eq: "editor" } },
                          ],
                        },
                      },
                    },
                  },
                ],
              },
            ],
          },
        },
      },
    },
    {
      type: "pg_create_delete_permission",
      args: {
        source: "default",
        table: { schema: "public", name: "workflow_triggers" },
        role: "user",
        permission: {
          filter: {
            workflow: {
              organization: {
                org_members: {
                  _and: [
                    { user_id: { _eq: "X-Hasura-User-Id" } },
                    { role: { _in: ["owner", "editor"] } },
                  ],
                },
              },
            },
          },
        },
      },
    },

    // 6. WORKFLOW_RUNS
    {
      type: "pg_create_select_permission",
      args: {
        source: "default",
        table: { schema: "public", name: "workflow_runs" },
        role: "user",
        permission: {
          columns: [
            "id",
            "workflow_id",
            "status",
            "trigger_type",
            "created_by",
            "started_at",
            "finished_at",
            "error",
            "created_at",
          ],
          filter: {
            workflow: {
              organization: {
                org_members: {
                  user_id: { _eq: "X-Hasura-User-Id" },
                },
              },
            },
          },
        },
      },
    },
    {
      type: "pg_create_insert_permission",
      args: {
        source: "default",
        table: { schema: "public", name: "workflow_runs" },
        role: "user",
        permission: {
          columns: ["id", "workflow_id", "status", "trigger_type", "started_at"],
          set: {
            created_by: "X-Hasura-User-Id",
          },
          check: {
            workflow: {
              organization: {
                org_members: {
                  _and: [
                    { user_id: { _eq: "X-Hasura-User-Id" } },
                    { role: { _in: ["owner", "editor"] } },
                  ],
                },
              },
            },
          },
        },
      },
    },
    {
      type: "pg_create_update_permission",
      args: {
        source: "default",
        table: { schema: "public", name: "workflow_runs" },
        role: "user",
        permission: {
          columns: ["status", "finished_at", "error"],
          filter: {
            workflow: {
              organization: {
                org_members: {
                  _and: [
                    { user_id: { _eq: "X-Hasura-User-Id" } },
                    { role: { _in: ["owner", "editor"] } },
                  ],
                },
              },
            },
          },
          check: {
            workflow: {
              organization: {
                org_members: {
                  _and: [
                    { user_id: { _eq: "X-Hasura-User-Id" } },
                    { role: { _in: ["owner", "editor"] } },
                  ],
                },
              },
            },
          },
        },
      },
    },

    // 7. STEP_RUNS
    {
      type: "pg_create_select_permission",
      args: {
        source: "default",
        table: { schema: "public", name: "step_runs" },
        role: "user",
        permission: {
          columns: [
            "id",
            "workflow_run_id",
            "workflow_step_id",
            "status",
            "input",
            "output",
            "error",
            "attempt_count",
            "approved_by",
            "approved_at",
            "started_at",
            "finished_at",
            "created_at",
          ],
          filter: {
            workflow_run: {
              workflow: {
                organization: {
                  org_members: {
                    user_id: { _eq: "X-Hasura-User-Id" },
                  },
                },
              },
            },
          },
        },
      },
    },
  ];

  const res = await fetch(metadataUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-hasura-admin-secret": adminSecret },
    body: JSON.stringify({ type: "bulk", args: permissionRules }),
  });

  const result = await res.json();
  console.log("Applied permissions including workflow_runs and step_runs:", JSON.stringify(result, null, 2));
}

applyPermissionsWithRuns().catch(console.error);
