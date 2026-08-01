import { parseOptions, requirePositional } from "../args.mjs";
import { renderHandoff } from "../config/runtime-context.mjs";
import { CliError } from "../errors.mjs";
import { assertGeneratedClean } from "../plan/generated-drift.mjs";
import { renderArtifacts } from "../plan/render-artifacts.mjs";
import { reviewContentSha256 } from "../plan/render-plan.mjs";
import { currentReviewRound } from "../review/review-state.mjs";
import { loadState, mutateState } from "../state/store.mjs";
import { output } from "./command-io.mjs";

async function handler(argv, io, runtimeContext) {
  const { positionals, options } = parseOptions(argv, { json: "boolean" });
  const slug = requirePositional(positionals, 0, "slug");
  const state = await loadState(runtimeContext, slug);
  if (state.status === "finalized" && state.review.final) {
    output(io, { slug, status: state.status, reviewContentSha256: state.review.final.reviewContentSha256, handoff: renderHandoff(runtimeContext, slug), resumed: true }, options.json);
    return 0;
  }
  await assertGeneratedClean(runtimeContext, state);
  const round = currentReviewRound(state);
  if (!round) throw new CliError("no prepared review round", { code: "FINALIZE_REVIEW_MISSING" });
  const digest = reviewContentSha256(state);
  if (digest !== round.reviewContentSha256) throw new CliError("review digest is stale", { code: "FINALIZE_STALE_DIGEST" });
  if (round.planCritic?.verdict !== "APPROVE" || round.architectureVerifier?.verdict !== "APPROVE") {
    throw new CliError("both review roles must approve before finalization", { code: "FINALIZE_APPROVALS_MISSING" });
  }
  let next = await mutateState(runtimeContext, slug, (candidate) => {
    candidate.status = "finalized";
    candidate.review.final = { round: round.round, reviewContentSha256: digest, finalizedAt: new Date().toISOString() };
    return candidate;
  }, { checkpoint: "finalized" });
  next = await renderArtifacts(runtimeContext, next);
  if (reviewContentSha256(next) !== digest) throw new CliError("review digest changed while rendering final receipts", { code: "FINALIZE_DIGEST_UNSTABLE" });
  const result = { slug, status: next.status, reviewContentSha256: digest, handoff: renderHandoff(runtimeContext, slug) };
  output(io, result, options.json);
  return 0;
}
export function register(registerCommand) { registerCommand("plan", "finalize", handler); }
