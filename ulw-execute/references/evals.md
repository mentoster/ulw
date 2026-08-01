# Evals — ulw-execute

## Routing

- Positive: `Выполни .hermes/plans/auth-migration.md.` → `ulw-execute`.
- Positive English: `Execute the finalized ULW plan at .hermes/plans/cache-migration.md.` → `ulw-execute`.
- Single-agent invariant: `Выполни план параллельными агентами.` → `ulw-execute`, but execute sequentially with the current agent and do not spawn agents.
- Planning collision: `Сначала спроектируй миграцию и напиши план.` → `ulw-plan`.
- Review collision: `Только проверь уже готовый diff.` → `ulw-review`.
- Worktree collision: `Создай worktree, но пока ничего не выполняй.` → `ulw-worktree`.
- English planning collision: `Architect the migration and stop after saving the plan.` → `ulw-plan`.
- English review collision: `Do not change code; only review the completed implementation.` → `ulw-review`.
- English abstention: `Show me how promises work in JavaScript.` → no ULW skill.
- Profile-aware positive: `Execute the finalized managed plan under the project-local .ulw artifact root.` → `ulw-execute` with matching profile/config.
- Migration collision: `This v1 plan must move to .ulw before coding.` → `ulw-plan`, not execution.

## Execution

The skill must read the plan and repository state before changes. A CLI-managed plan must pass `plan check` and show finalized current review status. A historical Markdown plan without the managed marker keeps the direct Markdown pre-flight and is not auto-imported. The skill executes every todo directly with the current agent, runs every task's happy/failure checks, performs F1-F4 final review, and never auto-merges or auto-cleans a branch.

## Compatibility Cases

- Managed valid: marker present, CLI checks pass, finalized status true → execute.
- Managed drift/stale review: marker present and CLI reports a problem → stop and return to `ulw-plan`.
- Historical unmanaged: no marker/state → execute using the complete Markdown contract.
- Historical modification request: route to `ulw-plan` for explicit semantic JSON conversion; do not infer state automatically.

Executable bilingual routing coverage lives in `../../evals/routing/cases.jsonl`. Run it through `ulw eval validate`, `ulw eval run`, and `ulw eval score`; enforce per-skill precision/recall, Russian and English F1, sibling-collision rate, and expected-null false-positive rate. The deterministic fixture runner proves the evaluator only, not real host quality.

Version 0.5.1 compatibility: installer transaction archives must remain outside the discoverable skills root; execution must resolve only the canonical installed skill.
