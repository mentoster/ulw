import test from "node:test";
import assert from "node:assert/strict";
import input from "./fixtures/valid-plan-input.json" with { type: "json" };
import { createDefaultState } from "../cli/src/state/default-state.mjs";
import { applyPlanInput } from "../cli/src/plan/input-schema.mjs";
import { renderPlan, renderReviewContent, reviewContentSha256 } from "../cli/src/plan/render-plan.mjs";

test("plan render is byte-identical and carries managed metadata", () => {
  const state = applyPlanInput(createDefaultState({ slug: "fixture", intent: "clear", depth: "standard", repository: {} }), input);
  const first = renderPlan(state);
  const second = renderPlan(state);
  assert.equal(first, second);
  assert.match(first, /^<!-- ulw-managed /);
  assert.match(first, /## Plan review/);
  assert.match(first, /T1\. Build fixture/);
});

test("review content digest ignores receipt fields but changes for semantic edits", () => {
  const state = applyPlanInput(createDefaultState({ slug: "fixture", intent: "clear", depth: "standard", repository: {} }), input);
  const before = reviewContentSha256(state);
  state.review.currentRound = 1;
  state.review.rounds.push({ round: 1, reviewContentSha256: before, planCritic: { verdict: "APPROVE" }, architectureVerifier: { verdict: "APPROVE" } });
  assert.equal(reviewContentSha256(state), before);
  state.scope.mustHave.push("A semantic change");
  assert.notEqual(reviewContentSha256(state), before);
  assert.match(renderReviewContent(state), /Review content SHA256: REVIEW_CONTENT_SHA256/);
});
