import { list, table, text } from "./markdown-format.mjs";

export function renderDraft(state, metadata) {
  const components = state.components.map((item) => [item.id, item.outcome, item.status ?? "active", item.evidence ?? ""]);
  const assumptions = state.assumptions.map((item) => [item.assumption, item.default, item.rationale ?? "", item.reversible ? "yes" : "no", item.rollback ?? ""]);
  const reviewRounds = state.review.rounds.length === 0
    ? "Pending"
    : state.review.rounds.map((round) => `- Round ${round.round}: ${round.planCritic?.verdict ?? "PENDING"} / ${round.architectureVerifier?.verdict ?? "PENDING"} (${round.reviewContentSha256})`).join("\n");
  return `<!-- ulw-managed schemaVersion=${state.schemaVersion} slug=${state.slug} revision=${state.revision} sourceStateSha256=${metadata.sourceStateSha256} -->
---
slug: ${state.slug}
status: ${state.status}
intent: ${state.intent}
depth: ${state.depth}
---

# Draft: ${state.slug}

## Components

${table(["id", "outcome", "status", "evidence"], components)}

## Open assumptions

${table(["assumption", "default", "rationale", "reversible", "rollback"], assumptions)}

## Findings

${list(state.findings.map((item) => `${item.text} (${item.evidence})`))}

## Decisions

${list(state.decisions.map((item) => `${item.decision} — ${item.rationale} [${item.owner ?? "default"}] (${item.evidence ?? "no evidence"})`))}

## Scope IN

${list(state.scope.mustHave)}

## Scope OUT (Must NOT have)

${list(state.scope.mustNotHave)}

## Approval gate

status: ${state.status}

Approach: ${text(state.approvalBrief.approach)}

Test strategy: ${text(state.approvalBrief.testStrategy)}

## Review receipts

${reviewRounds}
`;
}
