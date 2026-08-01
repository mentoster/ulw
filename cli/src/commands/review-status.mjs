import { parseOptions, requirePositional } from "../args.mjs";
import { reviewContentSha256 } from "../plan/render-plan.mjs";
import { currentReviewRound } from "../review/review-state.mjs";
import { loadState } from "../state/store.mjs";
import { output } from "./command-io.mjs";

async function handler(argv, io, runtimeContext) {
  const { positionals, options } = parseOptions(argv, { json: "boolean" });
  const slug = requirePositional(positionals, 0, "slug");
  const state = await loadState(runtimeContext, slug);
  const round = currentReviewRound(state);
  const result = {
    slug,
    status: state.status,
    currentRound: state.review.currentRound,
    preparedDigest: round?.reviewContentSha256 ?? null,
    currentDigest: reviewContentSha256(state),
    planCritic: round?.planCritic?.verdict ?? null,
    architectureVerifier: round?.architectureVerifier?.verdict ?? null,
    finalized: state.status === "finalized",
  };
  output(io, result, options.json);
  return 0;
}
export function register(registerCommand) { registerCommand("review", "status", handler); }
