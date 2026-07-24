import test from "node:test";
import assert from "node:assert/strict";

const { assignCorrelationId } = await import("../src/http.mjs");

test("every API request receives a server-generated correlation ID", () => {
  const request = {};
  const headers = new Map();
  let continued = false;
  assignCorrelationId(request, {
    set: (name, value) => headers.set(name.toLowerCase(), value),
  }, () => {
    continued = true;
  });
  assert.equal(continued, true);
  assert.match(request.correlationId, /^req_[a-f0-9]{32}$/);
  assert.equal(headers.get("x-correlation-id"), request.correlationId);
});
