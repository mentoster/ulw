import { join } from "node:path";
import { parseOptions, requirePositional } from "../args.mjs";
import { displayArtifactPath } from "../config/runtime-context.mjs";
import { CliError } from "../errors.mjs";
import { atomicWriteFile } from "../io/atomic-write.mjs";
import { resolveArtifactTarget } from "../io/path-policy.mjs";
import { assertGeneratedClean } from "../plan/generated-drift.mjs";
import { renderArtifacts } from "../plan/render-artifacts.mjs";
import { reviewContentSha256 } from "../plan/render-plan.mjs";
import { validatePlanState } from "../plan/validate-plan.mjs";
import { renderPrompt } from "../review/prompt-template.mjs";
import { currentReviewRound } from "../review/review-state.mjs";
import { assertCurrentStateVersion, loadState, mutateState } from "../state/store.mjs";
import { output } from "./command-io.mjs";

async function handler(argv, io, runtimeContext) {
  const { positionals, options } = parseOptions(argv, { round: "value", json: "boolean" });
  const slug = requirePositional(positionals, 0, "slug");
  let current = await loadState(runtimeContext, slug);
  assertCurrentStateVersion(current);
  if (current.status === "reviewing") {
    await assertGeneratedClean(runtimeContext, current);
    const existingRound = currentReviewRound(current);
    if (!existingRound || existingRound.reviewContentSha256 !== reviewContentSha256(current)) throw new CliError("prepared review is stale", { code: "REVIEW_STALE_PLAN" });
    const reviewDir = await resolveArtifactTarget(runtimeContext, join("ulw", slug, "reviews", `round-${existingRound.round}`));
    output(io, {
      slug,
      round: existingRound.round,
      reviewContentSha256: existingRound.reviewContentSha256,
      prompts: { planCritic: join(reviewDir, "plan-critic.prompt.txt"), architectureVerifier: join(reviewDir, "architecture-verifier.prompt.txt") },
      resumed: true,
    }, options.json);
    return 0;
  }
  if (current.review.currentRound >= current.review.maxRounds) throw new CliError("maximum review rounds exceeded", { code: "REVIEW_MAX_ROUNDS" });
  if (current.status !== "approved") throw new CliError("plan must be approved before review preparation", { code: "REVIEW_PREPARE_STATE" });
  await assertGeneratedClean(runtimeContext, current);
  const diagnostics = await validatePlanState(current, runtimeContext);
  if (diagnostics.length) throw new CliError("plan validation failed before review", { code: "REVIEW_PREPARE_INVALID", details: diagnostics.map((item) => `${item.code}: ${item.message}`) });
  const roundNumber = options.round ? Number(options.round) : current.review.currentRound + 1;
  if (!Number.isInteger(roundNumber) || roundNumber !== current.review.currentRound + 1) throw new CliError("review round must be the next sequential round", { code: "REVIEW_ROUND_SEQUENCE" });
  if (roundNumber > current.review.maxRounds) throw new CliError("maximum review rounds exceeded", { code: "REVIEW_MAX_ROUNDS" });
  const digest = reviewContentSha256(current);
  const instructionPaths = current.repository.instructions?.join(", ") || "AGENTS.md";
  const values = {
    SLUG: slug,
    WORKSPACE_ROOT: runtimeContext.workspace,
    PLAN_PATH: displayArtifactPath(runtimeContext, "plans", `${slug}.md`),
    DRAFT_PATH: displayArtifactPath(runtimeContext, "drafts", `${slug}.md`),
    REVIEW_CONTENT_SHA256: digest,
    INSTRUCTION_PATHS: instructionPaths,
    REVIEW_ROUND: roundNumber,
  };
  const reviewDir = await resolveArtifactTarget(runtimeContext, join("ulw", slug, "reviews", `round-${roundNumber}`));
  const prompts = {
    planCritic: join(reviewDir, "plan-critic.prompt.txt"),
    architectureVerifier: join(reviewDir, "architecture-verifier.prompt.txt"),
  };
  await atomicWriteFile(prompts.planCritic, await renderPrompt("plan-critic", values));
  await atomicWriteFile(prompts.architectureVerifier, await renderPrompt("architecture-verifier", values));
  let state = await mutateState(runtimeContext, slug, (next) => {
    next.status = "reviewing";
    next.review.currentRound = roundNumber;
    next.review.rounds.push({ round: roundNumber, reviewContentSha256: digest, preparedAt: new Date().toISOString(), planCritic: null, architectureVerifier: null });
    return next;
  }, { checkpoint: "prepared-review" });
  state = await renderArtifacts(runtimeContext, state);
  output(io, { slug, round: roundNumber, reviewContentSha256: digest, prompts: { planCritic: prompts.planCritic, architectureVerifier: prompts.architectureVerifier } }, options.json);
  return 0;
}
export function register(registerCommand) { registerCommand("review", "prepare", handler); }
