# CLEAR Intent Route

Use this route when the user knows the desired outcome and only implementation preferences or owner trade-offs remain.

## Research First

Inspect the implementation surface, existing patterns, tests, release/QA workflow, and external contracts before asking anything. Classify every uncertainty as:

- discoverable fact — research it;
- reversible internal choice — adopt and record a default;
- owner decision — ask because the choice is destructive, irreversible, security-critical, or changes a public contract.

## Design Discipline

Identify one to six components and one recommended architecture. Present alternatives only when they materially change risk, cost, compatibility, or maintenance.

Do not require a separate design handoff. The approved design becomes the architecture section and dependency graph of the final ULW plan.

## Interview Discipline

Ask one to three narrow questions per turn. For each question state what was inspected, why evidence did not resolve it, which branch depends on it, and the recommended option.

Always resolve the test strategy: TDD, tests-after, or no automated framework. Agent-executed QA remains mandatory.

When objective, scope, approach, test strategy, and owner decisions are resolved, present the approval brief and stop.

## After Approval

Record explicit approval through the CLI, run the self gap review, prepare the two mandatory Plan critic and Architecture verifier prompts for one review-content digest, and record both responses through the CLI. Finalize and hand off to `ulw-execute` only after both return `APPROVE`.
