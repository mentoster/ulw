---
name: ulw-finish
description: "Finish verified ULW work by presenting and applying the user's merge, pull request, keep, discard, or cleanup choice. Use when implementation and review are complete and branch or worktree lifecycle must be decided. Do not use while todos remain, to create a new worktree, or to perform the implementation review itself."
license: MIT
compatibility: "Requires Git and fresh project verification evidence; pull request operations may additionally require the repository's hosting CLI."
metadata:
  author: "mentoster"
  version: "0.5.2"
  ulw_cli_version: "0.5.2"
  tags: "ulw, git, branch, pull-request, cleanup"
  related_skills: "ulw-execute, ulw-review, ulw-worktree, github-pr-workflow"
---

# ULW Finish

## Job

Complete branch lifecycle only after implementation has fresh verification evidence, then execute the user's explicit merge, PR, keep, or discard choice safely.

## Pre-flight

1. Use `ulw-review` Final Proof or confirm its fresh F1-F4 result.
2. Confirm the active ULW profile/artifact root and that any required state migration completed before branch lifecycle changes.
3. Inspect branch, detached state, repository root, Git/common directories, worktree path, remotes, and status.
4. Determine the likely base branch from repository configuration and merge-base evidence.
5. Stop if tests or required project gates fail.

## Present Choices

For a named branch, offer:

1. Merge locally into the base branch.
2. Push and create a pull request.
3. Keep the branch and workspace unchanged.
4. Discard the branch and owned worktree.

For detached HEAD, omit local merge until a named branch is created.

Do not choose on the user's behalf.

## Merge Locally

Before mutation, ensure the target base checkout is safe and unrelated changes are preserved. Merge, rerun required verification on the merged result, and only then consider cleanup and branch deletion.

Do not delete the source branch if merge or post-merge verification fails.

## Push and Pull Request

Push the named branch using the configured remote and hand off GitHub-specific PR creation to `github-pr-workflow` when applicable.

Preserve the worktree for review fixes unless the user explicitly requests otherwise.

## Keep

Report the branch, workspace path, status, and latest relevant commit. Make no cleanup changes.

## Discard

Before destructive action, list the branch, worktree, and commits that will become unreachable. Require exact explicit confirmation for discard.

Never force-delete unrelated branches or harness-owned workspaces.

## Cleanup Ownership

Remove a worktree only when evidence proves this workflow or the user created and owns it. Prefer the host's native workspace cleanup mechanism. Use manual `git worktree remove` only for manually created repository-local worktrees and only from outside the target worktree.

Run `git worktree prune` after a successful manual removal.

## Verification Checklist

- [ ] Fresh final verification passed before choices.
- [ ] Branch, base, detached/worktree state, remotes, and status inspected.
- [ ] User explicitly selected the lifecycle action.
- [ ] Merge result reverified before deletion.
- [ ] PR path preserves workspace for feedback.
- [ ] Discard required exact confirmation.
- [ ] Only owned worktrees were cleaned.
- [ ] Final branch/worktree state reported with evidence.
