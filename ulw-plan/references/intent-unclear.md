# UNCLEAR Intent Route

Use this route when the requested outcome itself is fuzzy, such as improving a subsystem, cleaning up an architecture, or deciding what should be built.

## Consultant Stance

Do not turn the request into a long questionnaire. Perform wider research, choose one evidence-backed best-practice design, and expose reversible defaults for veto at the approval gate.

Ask exactly one focused question only when a destructive, irreversible, security-critical, or public-contract decision remains after research.

## Wider Research

Cover implementation and call flow, tests and CI, packaging and release, architecture boundaries, primary external documentation, operations, security, migration, rollback, and dirty-worktree risks.

Use this sequence for architecture-scale work:

1. Collect claims.
2. Verify and try to falsify load-bearing claims.
3. Design components, dependencies, acceptance, and evidence.
4. Challenge the highest-leverage assumption and remove incidental complexity.
5. Synthesize one recommended plan shape.

## Default Ledger

Record each unresolved reversible decision as:

```text
assumption | adopted default | evidence/rationale | reversible? | rollback
```

Prefer repository conventions over generic patterns and primary documentation over commentary.

## Approval and Review

The approval brief leads with the recommended design, full component scope, defaults and reversibility, Must-NOT-Have guardrails, and test/evidence strategy.

After approval, record it through the CLI and always run the mandatory Plan critic and Architecture verifier reviews against the same review-content digest, including Quick depth. Finalize only after both responses are recorded as `APPROVE`, and hand off only to `ulw-execute`.
