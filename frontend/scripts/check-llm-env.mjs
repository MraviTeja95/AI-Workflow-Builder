import fs from "node:fs";
import path from "node:path";



const env = loadEnv();
void env;

const keys = ["GEMINI_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GROQ_API_KEY"];
for (const k of keys) {
  console.log(`${k} present in .env.local:`, !!env[k]);
  console.log(`${k} present in process.env:`, !!process.env[k]);
}
