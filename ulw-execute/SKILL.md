---
name: ulw-execute
description: "Execute an approved ULW implementation plan from disk, task by task, with required tests, evidence, and final verification. Use when the user points to a finalized managed plan or a complete historical plan and asks to implement it now. Do not use to design a new plan, perform review-only work, or only create or clean up a worktree."
license: MIT
compatibility: "Requires Node.js 20+, npm, Git, the ulw CLI for managed plans, and a writable project workspace."
metadata:
  author: "mentoster"
  version: "0.5.2"
  ulw_cli_version: "0.5.2"
  tags: "ulw, execution, implementation, single-agent, evidence"
  related_skills: "ulw-plan, ulw-worktree, ulw-review, ulw-finish, systematic-debugging, test-driven-development"
---

# ULW Execute

## Job

Execute one approved implementation plan from disk, task by task, while preserving its scope, dependencies, evidence requirements, and repository safety constraints.

The active agent performs every todo directly. ULW execution never invokes agent-spawning tools, transfers work to another model, or creates a parallel execution lane.

## When to Use

Use when the user points to an approved plan or asks to continue an already planned implementation.

Do not use to design a change, resolve requirements, or write a new plan; use `ulw-plan`. Do not use for review-only work; use `ulw-review`.

## Pre-flight Gate

Before modifying anything:

1. Read workspace instructions and relevant nested instructions.
2. Inspect `git status --short` and preserve unrelated work.
3. Read the complete plan from disk.
4. Inspect the first line for the `<!-- ulw-managed` marker.
5. For a managed plan:
   - derive the slug from the marker or filename;
   - run `ulw plan check <slug> --json`;
   - run `ulw review status <slug> --json`;
   - require `finalized: true`, matching current/prepared digests, and both plan-review approvals before changes.
   - use the active profile/artifact root encoded by the plan path or CLI context; do not assume `.hermes` when the plan lives under another configured root.
   - if the CLI reports `STATE_MIGRATION_REQUIRED`, return to `ulw-plan` for explicit dry-run/confirmed migration rather than mutating old state during execution.
6. For a historical Markdown plan without the marker, preserve the existing pre-flight: directly confirm every todo has files, dependencies, acceptance, happy/failure QA, evidence paths, and final approval receipts when the plan contract requires them. Do not auto-convert it or assume generated state exists.
7. Identify the project verification commands and branch/worktree policy.

If a managed plan cannot pass CLI checks, stop and return it to `ulw-plan`; never bypass drift, state, or review diagnostics. If the `ulw` binary is missing, use the repository entrypoint when this is the ULW CLI source repository, otherwise report installation remediation.

If the plan has a blocking contradiction or missing owner decision, stop before product changes and return to `ulw-plan`. Small implementation details that repository evidence settles are not blockers.

Use `ulw-worktree` when project instructions or the plan require isolation and the current workspace is not already isolated.

## Single-Agent Ownership

The current agent owns implementation, tests, review fixes, evidence, and task state from start to finish. Process todos sequentially in dependency order. Use `references/gates-taxonomy.md` when defining recovery behavior for multiple checkpoints.

## Per-Todo Loop

Execute todos in dependency order:

1. Mark the todo in progress in the active task tracker.
2. Reread the todo and its referenced files.
3. Implement the smallest change satisfying the contract.
4. Keep implementation and its tests in the same todo.
5. Run the todo's happy-path and failure-path checks.
6. Save required evidence under the plan's evidence root.
7. Inspect the focused diff and repository status.
8. Run any required checkpoint review.
9. Fix findings and rerun invalidated checks.
10. Commit only when the plan or repository workflow calls for it.
11. Mark the todo complete only after fresh evidence proves acceptance.

Do not pause between clean todos for routine approval. Pause only for a real blocker, destructive choice, repeated non-convergence, or explicit user interruption.

## Revision and Escalation

- A failed test or review is a revision gate: diagnose, fix, and rerun.
- A plan/code contradiction that changes the requested outcome is an escalation gate: stop and ask the owner.
- A safety violation, unrelated destructive change, or unrecoverable environment failure is an abort gate: preserve state and stop.
- Do not repeat the same failed approach without changing the diagnosis, context, or task shape.

## Final Verification Wave

After all todos, use `ulw-review` to perform four separate checks:

1. F1 Plan compliance — every todo and guardrail satisfied.
2. F2 Code quality — correctness, maintainability, security, and project conventions.
3. F3 Real QA — user-facing happy and failure workflows, not only unit tests or grep.
4. F4 Scope fidelity — nothing requested omitted, nothing adjacent added, repository state accounted for.

All four must approve before completion is claimed.

## Finish Handoff

When implementation is complete and the user wants merge, PR, branch preservation, or cleanup, use `ulw-finish`.

Do not merge, discard, remove worktrees, or delete branches merely because implementation finished.

## Verification Checklist

- [ ] Approved plan read from disk.
- [ ] Managed plan passed CLI validation and finalized review status, or historical-plan compatibility was applied explicitly.
- [ ] Workspace instructions, git status, and isolation policy checked.
- [ ] Every todo executed in dependency order.
- [ ] Every todo was performed directly by the current agent.
- [ ] No agent-spawning or task-transfer tool was used.
- [ ] Happy/failure QA and evidence exist for every todo.
- [ ] Final F1-F4 review approved.
- [ ] Final diff and `git status --short` fully accounted for.
- [ ] Branch completion decisions handed to `ulw-finish`.
