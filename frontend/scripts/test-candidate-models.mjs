import fs from "node:fs";
import path from "node:path";



const env = loadEnv();
void env;

const key = env.GEMINI_API_KEY;

const candidateModels = [
  "gemini-2.5-flash-lite",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-flash-latest",
  "gemini-flash-lite-latest",
  "gemini-pro-latest",
  "gemini-3.6-flash",
];

async function testCandidateModels() {
  for (const model of candidateModels) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: "Say hello in one sentence." }] }],
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      console.log(`✓ Model [${model}] SUCCESS: "${text?.trim()}"`);
    } else {
      const errorJson = await res.json().catch(() => null);
      console.log(`✗ Model [${model}] FAILED (HTTP ${res.status}): ${errorJson?.error?.message?.slice(0, 100)}`);
    }
  }
}

testCandidateModels().catch(console.error);
