# Evals — ulw-review

## Routing

- Positive review: `Проведи свежий review готового implementation diff.` → `ulw-review`.
- Positive English: `Review the completed ULW diff against its plan and require fresh test evidence.` → `ulw-review`.
- Positive proof: `Докажи свежими командами, что план полностью выполнен.` → `ulw-review` Final Proof.
- Execute collision: `Исправь всё по утверждённому плану.` → `ulw-execute`.
- Planning collision: `Сначала напиши план и остановись.` → `ulw-plan`.
- GitHub collision: `Оставь inline comments в GitHub PR.` → `github-code-review`.
- English execute collision: `Fix the remaining todos from the approved plan.` → `ulw-execute`.
- English planning collision: `Create the implementation plan and wait for approval.` → `ulw-plan`.
- English abstention: `Summarize this code snippet.` → no ULW skill.
- Profile-aware positive: `Review the finished managed plan stored under .ulw with the project-local profile.` → `ulw-review`.
- Migration collision: `Upgrade the old plan schema during review.` → `ulw-plan`; review remains read-only.

## Execution

The skill must inspect requirements and actual changes directly, use the same agent for every pass, separate spec compliance from code quality, require fresh evidence, calibrate severity, rerun review after fixes, and withhold approval when any required check is unverified. For a managed plan it also consumes `plan check` and review-status diagnostics; for a historical plan it keeps the direct Markdown evidence contract without requiring state or automatic conversion.

Executable bilingual routing coverage lives in `../../evals/routing/cases.jsonl`. Run it through `ulw eval validate`, `ulw eval run`, and `ulw eval score`; enforce per-skill precision/recall, Russian and English F1, sibling-collision rate, and expected-null false-positive rate. The deterministic fixture runner proves the evaluator only, not real host quality.

Version 0.5.1 compatibility: review routing must resolve one canonical `ulw-review` skill and never a transaction snapshot.
