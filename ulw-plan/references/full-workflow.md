# ULW Planning Workflow

## Phase 0: Bootstrap

Run the CLI doctor, record the active profile/artifact root, classify depth and intent, initialize the slug, and snapshot repository facts. The CLI-managed state file is `<artifact-root>/ulw/<slug>/state.json`. The legacy profile uses `.hermes`; project-local uses `.ulw`. Draft and plan Markdown are generated views.

## Phase 1: Ground

Read instructions, Git status, implementation owners, tests, configuration, packaging, release, operations, security, and user-visible QA surfaces. Store only semantic facts and citations in the JSON input. Do not copy secrets, arbitrary environment data, or unrelated file bodies.

## Phase 2: Design

Define components, decisions/defaults, Must-have scope, Must-NOT-Have guardrails, preserved behavior, migration/rollback, verification commands, todos, commit strategy, and success criteria. The task graph is sequentially executable by the current agent.

## Phase 3: Import and Validate

Write semantic JSON under `<artifact-root>/ulw/<slug>/inputs/`, then run:

```bash
ulw plan import <slug> --file <input.json>
ulw plan render <slug>
ulw plan check <slug> --json
ulw plan next <slug> --json
```

Resolve every diagnostic through semantic JSON. Do not patch generated Markdown.

When the CLI reports an older state schema, inspect
`ulw plan migrate <slug> --dry-run --json` and require explicit `--yes` before
schema or artifact-root migration. Do not silently upgrade during read,
planning, review, or execution.

## Phase 4: Approval

Import `readyForApproval: true`, present the brief, and stop. After explicit approval:

```bash
ulw plan approve <slug> --json
```

A later scope or decision change invalidates approval and current review state as determined by the CLI.

## Phase 5: Self Gap Review

Reread canonical state, generated plan, cited files, and CLI diagnostics. Check component coverage, dependencies, constraints, acceptance, QA, evidence, and dirty-worktree safety. Correct semantic JSON and rerender until ready.

## Phase 6: Mandatory Review

Run for every final plan:

```bash
ulw review prepare <slug> --json
```

The command validates the plan and generates two canonical prompts for the same stable review-content digest. Run standard `sub review` once for the Plan critic prompt and once for the Architecture verifier prompt. Do not manually route either review through a chosen model, provider, or external chat CLI. Record both strict outputs through the CLI. The current planner applies every accepted correction.

Continue only when `ulw review status <slug> --json` reports two current approvals. Then run `ulw plan finalize <slug> --json`.

## Phase 7: Deliver

Report the finalized path, scope summary, decisions/defaults, and exact final statuses:

```text
Plan critic: APPROVE
Architecture verifier: APPROVE
```

Provide the CLI-emitted execution handoff and stop.

## Final Verification Wave Required in Every Plan

- F1 Plan compliance audit.
- F2 Code quality and security review.
- F3 Real happy/failure QA.
- F4 Scope fidelity and repository hygiene.
