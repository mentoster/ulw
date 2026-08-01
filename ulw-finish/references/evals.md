# Evals — ulw-finish

- Positive: `Реализация завершена; предложи merge, PR, keep или discard.` → `ulw-finish`.
- Positive English: `Implementation and review are complete; help me choose merge, PR, keep, or discard.` → `ulw-finish`.
- PR collision: `Создай GitHub PR из уже подготовленной ветки.` → `github-pr-workflow` may own the GitHub operation after lifecycle choice.
- Execute collision: `Продолжай выполнять оставшиеся todos.` → `ulw-execute`.
- Worktree collision: `Только создай новый worktree.` → `ulw-worktree`.
- English execute collision: `There are still two todos left; continue implementing them.` → `ulw-execute`.
- English review collision: `Only review the code; do not decide branch cleanup yet.` → `ulw-review`.
- English abstention: `How do pull requests work?` → no ULW skill.
- Profile-aware positive: `The project-local ULW run is fully verified; finish the branch lifecycle.` → `ulw-finish`.
- Lifecycle collision: `Update or uninstall the installed ULW skill bundle.` → no workflow skill; use `ulw skill update|uninstall`.

The skill must require fresh verification, inspect environment state, wait for the user's lifecycle choice, preserve PR workspaces, and require exact confirmation before discard.

Executable bilingual routing coverage lives in `../../evals/routing/cases.jsonl`. Run it through `ulw eval validate`, `ulw eval run`, and `ulw eval score`; enforce per-skill precision/recall, Russian and English F1, sibling-collision rate, and expected-null false-positive rate. The deterministic fixture runner proves the evaluator only, not real host quality.

Version 0.5.1 compatibility: lifecycle completion must use only canonical installed skills, never retained rollback snapshots.
