import { CliError } from "../errors.mjs";

export function currentReviewRound(state) {
  return state.review.rounds.find((round) => round.round === state.review.currentRound) ?? null;
}

export function receiptKey(role) {
  if (role === "plan-critic") return "planCritic";
  if (role === "architecture-verifier") return "architectureVerifier";
  throw new CliError(`unknown review role: ${role}`, { code: "REVIEW_ROLE_INVALID" });
}

export function applyReceipt(state, parsed) {
  const round = currentReviewRound(state);
  if (!round) throw new CliError("no prepared review round", { code: "REVIEW_NOT_PREPARED" });
  if (round.round !== parsed.round || round.reviewContentSha256 !== parsed.reviewContentSha256) {
    throw new CliError("receipt does not match current review round", { code: "REVIEW_STALE_RECEIPT" });
  }
  const key = receiptKey(parsed.role);
  if (round[key]) {
    if (JSON.stringify(round[key]) !== JSON.stringify(parsed)) throw new CliError("conflicting duplicate review receipt", { code: "REVIEW_DUPLICATE_CONFLICT" });
    return state;
  }
  round[key] = parsed;
  round.updatedAt = new Date().toISOString();
  if (parsed.verdict !== "APPROVE" && round.round >= state.review.maxRounds) state.status = "blocked";
  else if (parsed.verdict === "BLOCKED") state.status = "blocked";
  else if (parsed.verdict === "CHANGES_REQUIRED") state.status = "revision-required";
  return state;
}
