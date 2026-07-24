import crypto from "node:crypto";
import OpenAI, { toFile } from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { config } from "./config.mjs";

let instance;

export function openai() {
  if (!config.openaiApiKey) throw new Error("OPENAI_API_KEY is not configured.");
  instance ??= new OpenAI({ apiKey: config.openaiApiKey });
  return instance;
}

export async function uploadDocument({ buffer, filename, mimeType }) {
  const file = await toFile(buffer, filename, { type: mimeType || "application/octet-stream" });
  return openai().files.create({ file, purpose: "user_data" });
}

export async function deleteDocumentFile(fileId) {
  try {
    await openai().files.delete(fileId);
  } catch (error) {
    console.warn("OpenAI file deletion could not be confirmed", error instanceof Error ? error.message : "Unknown error");
  }
}

export function safetyIdentifier(ownerHash) {
  return crypto.createHash("sha256").update(ownerHash).digest("hex").slice(0, 32);
}

export async function parseStructured({
  model,
  instructions,
  content,
  schema,
  schemaName,
  effort,
  ownerHash,
  tools,
  timeoutMs,
}) {
  const response = await openai().responses.parse({
    model,
    instructions,
    input: [{ role: "user", content }],
    reasoning: { effort },
    text: { format: zodTextFormat(schema, schemaName) },
    safety_identifier: safetyIdentifier(ownerHash),
    tools,
    store: false,
  }, {
    timeout: timeoutMs,
    maxRetries: 0,
  });
  if (!response.output_parsed) throw new Error(`${schemaName} returned no schema-validated output.`);
  return response.output_parsed;
}
