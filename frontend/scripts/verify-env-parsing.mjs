import nextEnv from "@next/env";
const { loadEnvConfig } = nextEnv;

const projectDir = process.cwd();
const { combinedEnv } = loadEnvConfig(projectDir);

console.log("=======================================================================");
console.log("   NEXT.JS ENVIRONMENT VARIABLE PARSER VERIFICATION                    ");
console.log("=======================================================================");
console.log("• HASURA_GRAPHQL_ENDPOINT:", combinedEnv.HASURA_GRAPHQL_ENDPOINT);
console.log("• Admin Secret Present:", !!combinedEnv.HASURA_GRAPHQL_ADMIN_SECRET);
console.log("• Admin Secret Length:", combinedEnv.HASURA_GRAPHQL_ADMIN_SECRET?.length);
console.log("• Expected Length: 32");

if (combinedEnv.HASURA_GRAPHQL_ADMIN_SECRET?.length === 32) {
  console.log("\n✓ SUCCESS: Next.js dotenv parser correctly loaded the full 32-character admin secret without truncation!");
} else {
  console.error("\n✗ ERROR: Admin secret length mismatch!");
  process.exit(1);
}
