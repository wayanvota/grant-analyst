const finalStates = new Set(["complete", "complete_with_warnings", "partial"]);

export function completionStateForAnalysis(analysis) {
  const state = analysis?.manifest?.completion_state
    || analysis?.pipeline?.status
    || (analysis?.pipeline?.partial ? "partial" : "complete");
  if (!finalStates.has(state)) throw new Error(`Unsupported review completion state: ${state}`);
  return state;
}

export function persistedReviewState(analysis) {
  const completionState = completionStateForAnalysis(analysis);
  return {
    status: completionState,
    stage: completionState,
    completionState,
    workspaceStatus: completionState === "complete"
      ? "reviewed"
      : completionState === "complete_with_warnings"
        ? "reviewed_with_warnings"
        : "review_partial",
  };
}
