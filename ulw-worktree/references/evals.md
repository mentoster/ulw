# Evals — ulw-worktree

- Positive: `Создай отдельный generic worktree для feature и проверь baseline.` → `ulw-worktree`.
- Positive English: `Create an isolated Git worktree for this feature and verify the baseline only.` → `ulw-worktree`.
- Existing isolation: `Мы уже в linked worktree, подготовь его.` → reuse, do not nest.
- Project collision: `Создай worktree по специальным правилам этого проекта.` → the project-specific worktree skill first.
- Finish collision: `Удалить worktree после merge.` → `ulw-finish`.
- English execute collision: `Continue implementing the approved plan in the current workspace.` → `ulw-execute`.
- English finish collision: `The work is complete; remove or keep the existing worktree.` → `ulw-finish`.
- English abstention: `What is a Git branch?` → no ULW skill.
- Profile collision: `Create a worktree for a project using .ulw artifacts.` → `ulw-worktree`; `.ulw` is not the worktree path.

The skill must prefer native workspace tooling, verify manual target ignore state, avoid nested worktrees, record baseline results, and never perform cleanup.

Executable bilingual routing coverage lives in `../../evals/routing/cases.jsonl`. Run it through `ulw eval validate`, `ulw eval run`, and `ulw eval score`; enforce per-skill precision/recall, Russian and English F1, sibling-collision rate, and expected-null false-positive rate. The deterministic fixture runner proves the evaluator only, not real host quality.

Version 0.5.1 compatibility: host diagnostics in ordinary repositories are consumer checks and must not require `ulw-cli` package metadata.
