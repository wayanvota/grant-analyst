import test from "node:test";
import assert from "node:assert/strict";
import { persistedReviewState } from "../src/review-state.mjs";

test("partial analysis cannot be persisted as a clean completion", () => {
  const state = persistedReviewState({
    manifest: { completion_state: "partial" },
    pipeline: { partial: true },
  });
  assert.deepEqual(state, {
    status: "partial",
    stage: "partial",
    completionState: "partial",
    workspaceStatus: "review_partial",
  });
});

test("complete and warning states remain explicit", () => {
  assert.equal(persistedReviewState({
    manifest: { completion_state: "complete" },
  }).status, "complete");
  assert.equal(persistedReviewState({
    manifest: { completion_state: "complete_with_warnings" },
  }).status, "complete_with_warnings");
});
