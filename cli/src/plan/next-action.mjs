export function nextAction(state, diagnostics = []) {
  if (diagnostics.length > 0) return { action: "fill-plan-data", reasons: diagnostics.map((item) => item.code), blockingDiagnostics: diagnostics };
  if (state.status === "drafting") return { action: "present-approval", reasons: ["plan data is complete"], blockingDiagnostics: [] };
  if (state.status === "awaiting-approval") return { action: "await-user-approval", reasons: ["explicit user approval is required"], blockingDiagnostics: [] };
  if (state.status === "approved") return { action: "prepare-reviews", reasons: ["approved plan has no current review round"], blockingDiagnostics: [] };
  if (state.status === "revision-required") return { action: "revise-plan", reasons: ["a reviewer requested changes"], blockingDiagnostics: [] };
  if (state.status === "blocked") return { action: "resolve-blocker", reasons: ["plan review is blocked"], blockingDiagnostics: [] };
  if (state.status === "reviewing") {
    const current = state.review.rounds.find((round) => round.round === state.review.currentRound);
    const verdicts = [current?.planCritic?.verdict, current?.architectureVerifier?.verdict];
    if (verdicts.includes("CHANGES_REQUIRED")) return { action: "revise-plan", reasons: ["review changes are required"], blockingDiagnostics: [] };
    if (verdicts.includes("BLOCKED")) return { action: "resolve-blocker", reasons: ["review is blocked"], blockingDiagnostics: [] };
    if (verdicts.every((verdict) => verdict === "APPROVE")) return { action: "finalize", reasons: ["both review roles approved"], blockingDiagnostics: [] };
    return { action: "record-reviews", reasons: ["both reviewer receipts are required"], blockingDiagnostics: [] };
  }
  if (state.status === "finalized") return { action: "handoff", reasons: ["plan is finalized"], blockingDiagnostics: [] };
  return { action: "ground-evidence", reasons: ["planning state is incomplete"], blockingDiagnostics: [] };
}
