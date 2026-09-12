import assert from "node:assert/strict";
import { z } from "zod";
import { parseStructured } from "../backend/src/openai-client.mjs";

assert.ok(process.env.OPENAI_API_KEY, "OPENAI_API_KEY is required for the live OpenAI smoke test.");

const result = await parseStructured({
  model: process.env.OPENAI_FAST_MODEL || "gpt-5.6-luna",
  instructions: "Return only a source-bounded grant review finding. Do not add facts beyond the supplied evidence.",
  content: [{
    type: "input_text",
    text: "Evidence SRC-1: The application deadline is 2030-12-31. State whether the deadline is documented and cite its evidence ID.",
  }],
  schema: z.object({
    decision: z.enum(["documented", "not_documented"]),
    evidence_id: z.literal("SRC-1"),
    finding: z.string().min(1),
  }),
  schemaName: "grant_analyst_live_smoke",
  effort: "low",
  ownerHash: "grant-analyst-e2e-live-smoke",
  timeoutMs: 45_000,
  maxOutputTokens: 250,
  moduleId: "live_smoke",
});

assert.equal(result.decision, "documented");
assert.equal(result.evidence_id, "SRC-1");
console.log("Grant Analyst OpenAI live smoke passed: structured evidence boundary accepted.");
