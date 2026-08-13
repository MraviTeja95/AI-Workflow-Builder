import fs from "node:fs";
import path from "node:path";



const env = loadEnv();
void env;

const endpoint =
  env.HASURA_GRAPHQL_ENDPOINT ||
  "https://zggynlwwpraxjmbawiym.hasura.ap-southeast-1.nhost.run/v1/graphql";
const adminSecret = env.HASURA_GRAPHQL_ADMIN_SECRET;

const query = `
query VerifySetup {
  organizations {
    id
    name
    quota_limit
    quota_used
    quota_period_start
    created_at
    org_members {
      id
      org_id
      user_id
      role
      created_at
    }
  }
  org_members {
    id
    org_id
    user_id
    role
    created_at
  }
  users {
    id
    email
    displayName
  }
}
`;

async function main() {
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-hasura-admin-secret": adminSecret,
      },
      body: JSON.stringify({ query }),
    });

    const data = await res.json();
    if (data.errors) {
      console.error("GraphQL Errors:", JSON.stringify(data.errors, null, 2));
      process.exit(1);
    }

    console.log("=== VERIFICATION DATA ===");
    console.log(JSON.stringify(data.data, null, 2));
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }
}

main();
