import test from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
process.env.SESSION_PEPPER = "test-session-pepper-that-is-long-enough";

const { cleanText, HttpError, requestOwner } = await import("../src/http.mjs");

test("cleanText enforces required and length constraints", () => {
  assert.equal(cleanText("  Wayan  ", "Name", { required: true }), "Wayan");
  assert.throws(() => cleanText("", "Name", { required: true }), HttpError);
  assert.throws(() => cleanText("abcdef", "Name", { max: 5 }), HttpError);
});

test("requestOwner creates a stable hash without storing the browser secret", () => {
  const request = { get: () => "abcdefghijklmnopqrstuvwxyzABCDEFGH123456" };
  const first = requestOwner(request);
  const second = requestOwner(request);
  assert.equal(first, second);
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.notEqual(first, request.get());
});

test("requestOwner rejects weak session values", () => {
  assert.throws(() => requestOwner({ get: () => "short" }), HttpError);
});
