import test from "node:test";
import assert from "node:assert/strict";
import { analysisErrorCodes, classifyAnalysisError } from "../src/analysis-errors.mjs";

test("analysis failures receive stable, safe error codes", () => {
  const timeout = classifyAnalysisError(new Error("Request timed out."), "decision");
  assert.equal(timeout.code, analysisErrorCodes.timeout);
  assert.equal(timeout.retryable, true);
  assert.equal(timeout.moduleId, "decision");
  assert.doesNotMatch(timeout.message, /secret|api[_ -]?key/i);

  const rateLimit = classifyAnalysisError({ status: 429, message: "rate limit" }, "funder_research");
  assert.equal(rateLimit.code, analysisErrorCodes.rateLimit);
  assert.equal(rateLimit.retryable, true);

  const authentication = classifyAnalysisError({ status: 401, message: "bad api key" }, "analysis");
  assert.equal(authentication.code, analysisErrorCodes.authentication);
  assert.equal(authentication.retryable, false);
  assert.doesNotMatch(authentication.message, /bad api key/i);
});
