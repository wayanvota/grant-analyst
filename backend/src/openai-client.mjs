import crypto from "node:crypto";
import OpenAI, { toFile } from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { AnalysisStageError, analysisErrorCodes, classifyAnalysisError } from "./analysis-errors.mjs";
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
  maxOutputTokens,
  moduleId = schemaName,
  onProviderResponse,
}) {
  try {
    const response = await openai().responses.parse({
      model,
      instructions,
      input: [{ role: "user", content }],
      reasoning: { effort },
      text: { format: zodTextFormat(schema, schemaName) },
      safety_identifier: safetyIdentifier(ownerHash),
      tools,
      store: false,
      max_output_tokens: maxOutputTokens,
    }, {
      timeout: timeoutMs,
      maxRetries: 0,
    });
    const providerRequestId = response._request_id || response.request_id || null;
    onProviderResponse?.({
      module_id: moduleId,
      provider_request_id: providerRequestId,
      response_id: response.id || null,
      model,
    });
    if (!response.output_parsed) {
      throw new AnalysisStageError({
        code: analysisErrorCodes.schema,
        moduleId,
        message: "The provider response did not satisfy the required output schema.",
        retryable: true,
        providerRequestId,
      });
    }
    return response.output_parsed;
  } catch (error) {
    throw classifyAnalysisError(error, moduleId);
  }
}
