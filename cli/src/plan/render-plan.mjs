import { sha256, canonicalJson } from "../state/store.mjs";
import { list, table, text } from "./markdown-format.mjs";

export function semanticPlanSha256(state) {
  const content = {
    schemaVersion: state.schemaVersion,
    slug: state.slug,
    intent: state.intent,
    depth: state.depth,
    summary: state.summary,
    components: state.components,
    findings: state.findings,
    decisions: state.decisions,
    assumptions: state.assumptions,
    scope: state.scope,
    verification: state.verification,
    todos: state.todos,
    commitStrategy: state.commitStrategy,
    successCriteria: state.successCriteria,
    finalVerification: state.finalVerification,
  };
  return sha256(canonicalJson(content));
}

function renderTodo(todo) {
  const files = todo.files.map((file) => `  - ${file.action}: \`${file.path}\``).join("\n");
  return `- [ ] ${todo.id}. ${todo.title}
  Component: ${todo.component}
  Files:
${files}
  What to do: ${todo.whatToDo}
  Must NOT do: ${todo.mustNotDo}
  Blocked by: ${todo.dependsOn.length ? todo.dependsOn.join(", ") : "none"} | Blocks: ${todo.blocks.length ? todo.blocks.join(", ") : "none"}
  References: ${todo.references.join("; ")}
  Acceptance: ${todo.acceptance}
  QA happy: ${todo.qaHappy}
  QA failure: ${todo.qaFailure}
  Evidence: ${todo.evidence}
  Commit: ${todo.commit}
`;
}

function reviewFields(state, normalized) {
  if (normalized) return { round: 0, digest: "REVIEW_CONTENT_SHA256", planCritic: "PENDING", architectureVerifier: "PENDING" };
  const current = state.review.rounds.find((round) => round.round === state.review.currentRound);
  return {
    round: state.review.currentRound,
    digest: current?.reviewContentSha256 ?? "PENDING",
    planCritic: current?.planCritic?.verdict ?? "PENDING",
    architectureVerifier: current?.architectureVerifier?.verdict ?? "PENDING",
  };
}

export function renderPlan(state, { normalizedReview = false } = {}) {
  const sourceStateSha256 = semanticPlanSha256(state);
  const renderedRevision = normalizedReview ? "REVIEW_REVISION" : state.revision;
  const review = reviewFields(state, normalizedReview);
  const matrix = state.todos.map((todo) => [todo.id, todo.dependsOn.join(", ") || "none", todo.blocks.join(", ") || "none"]);
  const todos = state.todos.map(renderTodo).join("\n");
  return `<!-- ulw-managed schemaVersion=${state.schemaVersion} slug=${state.slug} revision=${renderedRevision} sourceStateSha256=${sourceStateSha256} -->
# ${state.slug} - Work Plan

## TL;DR (For humans)

**What you'll get:** ${text(state.summary.whatYouGet)}

**Why this approach:** ${text(state.summary.whyThisApproach)}

**What it will NOT do:**
${list(state.summary.whatItWillNotDo)}

**Effort:** ${text(state.summary.effort)}
**Risk:** ${text(state.summary.risk)}
**Decisions to sanity-check:** ${state.summary.decisionsToCheck.join("; ") || "None"}

**Next move:** Execute with \`/ulw-execute execute ${(state.provenance?.artifactRoot ?? ".hermes")}/plans/${state.slug}.md\` after final review.

---

> TL;DR (machine): ${text(state.summary.whatYouGet)}

## Scope

### Must have
${list(state.scope.mustHave)}

### Must NOT have (guardrails)
${list(state.scope.mustNotHave)}

### Preserve unchanged behavior
${list(state.scope.preserve)}

### Migration and rollback boundaries
${list(state.scope.migrationRollback)}

## Verification strategy

- Test decision: ${text(state.verification.testDecision)}
- Evidence root: \`${state.verification.evidenceRoot}\`
- Commands:
${list(state.verification.commands)}
- Misleading-success rejection:
${list(state.verification.misleadingSuccess)}

## Execution strategy

### Single-agent execution order

Execute todos in dependency order. Keep implementation and tests in the same todo.

### Dependency matrix

${table(["Todo", "Depends on", "Blocks"], matrix)}

## Todos

${todos || "- No todos provided"}
## Plan review

Review round: ${review.round}
Review content SHA256: ${review.digest}
Plan critic: ${review.planCritic}
Architecture verifier: ${review.architectureVerifier}

## Final verification wave

${list(state.finalVerification)}

## Commit strategy

${list(state.commitStrategy)}

## Success criteria

${list(state.successCriteria)}
`;
}

export function renderReviewContent(state) {
  return renderPlan(state, { normalizedReview: true });
}

export function reviewContentSha256(state) {
  return sha256(renderReviewContent(state));
}
