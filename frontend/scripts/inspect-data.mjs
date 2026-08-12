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
        const value = trimmed.slice(idx + 1).trim();
        env[key] = value;
      }
    }
  }
  return env;
}

const env = loadEnv();
const endpoint =
  env.HASURA_GRAPHQL_ENDPOINT ||
  env.NHOST_GRAPHQL_URL ||
  "https://zggynlwwpraxjmbawiym.hasura.ap-southeast-1.nhost.run/v1/graphql";
const adminSecret = env.HASURA_GRAPHQL_ADMIN_SECRET;

const query = `
query ReadOnlyDataInspection {
  organizations {
    id
    name
    quota_limit
    quota_used
    created_at
  }
  org_members {
    id
    org_id
    user_id
    role
    created_at
  }
  users(limit: 5) {
    id
    email
    displayName
  }
  __schema {
    mutationType {
      fields {
        name
      }
    }
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
      console.log("GraphQL partial/errors:", JSON.stringify(data.errors, null, 2));
    }
    console.log("DATA RESPONSE:");
    console.log("Organizations:", JSON.stringify(data.data?.organizations, null, 2));
    console.log("Org Members:", JSON.stringify(data.data?.org_members, null, 2));
    console.log("Users:", JSON.stringify(data.data?.users, null, 2));

    const mutations = data.data?.__schema?.mutationType?.fields?.map((f) => f.name) || [];
    const relevantMutations = mutations.filter(
      (m) =>
        m.includes("workflow") ||
        m.includes("step") ||
        m.includes("trigger") ||
        m.includes("organization")
    );
    console.log("\nRelevant Mutations found:");
    console.log(relevantMutations);
  } catch (err) {
    console.error("Error:", err);
  }
}

main();
