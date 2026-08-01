---
name: ulw-review
description: "Review completed or nearly completed ULW work against its plan or requirements and require fresh evidence before approval. Use when the user asks for code review, compliance review, or proof that implementation is complete. Do not use to implement remaining todos, create the original plan, or manage branch lifecycle."
license: MIT
compatibility: "Requires Git and the project test or verification commands; managed plans additionally require Node.js 20+ and the ulw CLI."
metadata:
  author: "mentoster"
  version: "0.5.2"
  ulw_cli_version: "0.5.2"
  tags: "ulw, review, verification, evidence, quality"
  related_skills: "ulw-plan, ulw-execute, precommit-code-verification, github-code-review"
---

# ULW Review

## Job

Review implementation against its plan or requirements and require fresh evidence before any completion claim. The same agent that owns ULW execution performs every review pass after rereading the actual artifacts from disk.

## Modes

### Checkpoint Review

Use after a high-risk todo or meaningful implementation checkpoint. Check specification compliance first, then code quality. Do not let style discussion hide missing requirements.

### Fresh Self-Review

Start by rereading the plan, requirements, diff, and relevant surrounding code from disk. Treat the pass as read-only until findings are complete. Do not rely on implementation memory or the prior summary.

### Final Proof

Use before claiming an implementation complete. Run fresh commands and complete F1-F4:

- F1 Plan compliance.
- F2 Code quality and security.
- F3 Real user-facing happy/failure QA.
- F4 Scope fidelity and repository hygiene.

## Evidence Gate

Before a positive claim:

1. Identify what command, artifact, or inspection proves it.
2. Run or perform the complete check now.
3. Read the full relevant output and exit status.
4. Compare the result to the exact requirement.
5. State the actual status with evidence.

A focused test proves only its focused behavior. A build does not prove lint, full tests, user workflow, or clean repository state unless those checks are part of the same command.

## Review Inputs

Collect:

- plan or requirements path;
- component/todo being reviewed;
- base and head revisions when meaningful;
- changed and untracked paths;
- relevant project instructions;
- test, build, lint, typecheck, and QA commands already run;
- evidence paths and known limitations.

Do not review from the implementer's summary alone.

## Managed and Historical Plans

When the plan begins with `<!-- ulw-managed`, run `ulw plan check <slug> --json` and `ulw review status <slug> --json` with the matching profile/config when needed before using plan metadata. Treat CLI diagnostics as additional evidence, not a replacement for inspecting the implementation diff and running real verification. A state migration warning is not permission to rewrite state during review.

For a historical Markdown plan without the marker, keep the existing evidence contract and review it directly. Do not require generated state and do not auto-convert it. If the user wants to alter or re-finalize the plan itself, route that plan to `ulw-plan` for explicit semantic JSON conversion.

## Finding Severity

- **Critical:** data loss, security vulnerability, broken core behavior, destructive scope violation.
- **Important:** missing requirement, architectural defect, incorrect error handling, meaningful test gap.
- **Minor:** maintainability or clarity improvement that does not block correctness.

Every blocking finding includes a file/location, violated requirement, impact, and concrete correction.

## Revision Loop

1. Record cited findings before editing.
2. Fix Critical and Important findings in the same session.
3. Rerun every check invalidated by the fix.
4. Rereview the updated artifact.
5. Approve only when no blocking finding remains.

Push back on an incorrect finding with source evidence or tests; do not accept review feedback mechanically.

## Repository Final-State Hygiene

Before final approval:

- inspect the final diff;
- inspect `git status --short` including untracked files;
- account for every path and preserve unrelated pre-existing work;
- rerun gates affected by the last change;
- distinguish focused checks from project-wide completion gates;
- verify the real user workflow where feasible.

## Output Contract

Return:

```text
VERDICT: APPROVE|CHANGES_REQUIRED|BLOCKED
STRENGTHS:
CRITICAL:
IMPORTANT:
MINOR:
EVIDENCE:
UNVERIFIED:
```

Never output `APPROVE` while required evidence is missing.

## Verification Checklist

- [ ] Requirements and actual diff inspected directly.
- [ ] Managed-plan CLI diagnostics or historical-plan compatibility were applied correctly.
- [ ] Specification compliance checked before style quality.
- [ ] Findings are cited and severity-calibrated.
- [ ] Blocking findings fixed and rereviewed.
- [ ] Fresh verification supports each positive claim.
- [ ] F1-F4 completed for final approval.
- [ ] Final repository state fully accounted for.
