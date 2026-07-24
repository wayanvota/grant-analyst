export const analysisErrorCodes = Object.freeze({
  timeout: "ANALYSIS_TIMEOUT",
  schema: "ANALYSIS_SCHEMA_INVALID",
  rateLimit: "PROVIDER_RATE_LIMITED",
  authentication: "PROVIDER_AUTHENTICATION_FAILED",
  provider: "PROVIDER_REQUEST_FAILED",
  internal: "INTERNAL_ANALYSIS_ERROR",
  serviceRestart: "SERVICE_RESTARTED",
});

function requestId(error) {
  return error?.request_id
    || error?.requestId
    || error?.headers?.get?.("x-request-id")
    || null;
}

export function classifyAnalysisError(error, moduleId = "analysis") {
  if (error instanceof AnalysisStageError) return error;
  const name = String(error?.name || "");
  const message = String(error?.message || "");
  const status = Number(error?.status || 0);
  let code = analysisErrorCodes.internal;
  let retryable = false;
  let safeMessage = "The analysis stage could not be completed.";

  if (/timeout|timed out|abort/i.test(`${name} ${message}`)) {
    code = analysisErrorCodes.timeout;
    retryable = true;
    safeMessage = "The analysis stage exceeded its time budget.";
  } else if (/schema|validation|output_parsed/i.test(`${name} ${message}`)) {
    code = analysisErrorCodes.schema;
    retryable = true;
    safeMessage = "The provider response did not satisfy the required output schema.";
  } else if (status === 429 || /rate.?limit/i.test(`${name} ${message}`)) {
    code = analysisErrorCodes.rateLimit;
    retryable = true;
    safeMessage = "The analysis provider temporarily rate-limited this request.";
  } else if (status === 401 || status === 403 || /auth|api key/i.test(`${name} ${message}`)) {
    code = analysisErrorCodes.authentication;
    safeMessage = "The analysis provider rejected the service credentials.";
  } else if (status >= 400 || /api|provider|connection/i.test(`${name} ${message}`)) {
    code = analysisErrorCodes.provider;
    retryable = status >= 500 || status === 408;
    safeMessage = "The analysis provider could not complete the request.";
  }

  return new AnalysisStageError({
    code,
    moduleId,
    message: safeMessage,
    retryable,
    providerRequestId: requestId(error),
    cause: error,
  });
}

export class AnalysisStageError extends Error {
  constructor({
    code,
    moduleId,
    message,
    retryable = false,
    providerRequestId = null,
    cause,
  }) {
    super(message, cause ? { cause } : undefined);
    this.name = "AnalysisStageError";
    this.code = code;
    this.moduleId = moduleId;
    this.retryable = retryable;
    this.providerRequestId = providerRequestId;
  }

  toRecord() {
    return {
      code: this.code,
      module_id: this.moduleId,
      message: this.message,
      retryable: this.retryable,
      provider_request_id: this.providerRequestId,
    };
  }
}
