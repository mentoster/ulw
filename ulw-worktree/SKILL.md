---
name: ulw-worktree
description: "Create or reuse a safe isolated Git worktree for ULW feature work and verify its baseline before implementation. Use when the user or repository policy requires branch isolation before coding. Do not use to execute the implementation plan, review finished work, or remove a completed worktree."
license: MIT
compatibility: "Requires Git with worktree support and a repository location where the selected worktree path is permitted."
metadata:
  author: "mentoster"
  version: "0.5.2"
  ulw_cli_version: "0.5.2"
  tags: "ulw, git, worktree, isolation, safety"
  related_skills: "ulw-plan, ulw-execute, ulw-finish, git-branch-sync"
---

# ULW Worktree

## Job

Create or verify an isolated Git workspace without fighting the host harness or damaging existing branch state.

## Step 1: Detect Existing Isolation

Inspect Git directory, common directory, current branch, repository root, and superproject state. A differing Git/common directory indicates a linked worktree only when the checkout is not merely a submodule.

If already isolated, reuse it and report the path and branch. Never create a nested worktree.

## Step 2: Resolve Policy

Use explicit user instructions and repository `AGENTS.md`/`CLAUDE.md` first. If the host provides a native worktree/open-workspace tool, use it instead of manual `git worktree add`.

When no instruction requires isolation and the user did not request it, do not create a worktree silently. Report the option or continue in place according to the owning workflow.

## Step 3: Manual Fallback

Only when no native mechanism exists:

1. Prefer an existing repository-local `.worktrees/`, then `worktrees/`, otherwise `.worktrees/`.
2. Verify the directory is ignored before creation.
3. Choose an explicit branch name and target path.
4. Run `git worktree add <path> -b <branch>`.
5. Never embed credentials in remotes.

If the host blocks creation, report the failure and do not pretend isolation exists.

## Step 4: Bootstrap and Baseline

Run project-specific dependency/setup commands only when repository instructions require them. Then run the relevant baseline test/build gate.

If baseline verification fails, record the exact pre-existing failure and follow the owning workflow's blocker policy before implementation.

When the owning ULW workflow uses a project-local profile, keep `.ulw` artifacts and `.agents/skills` separate from worktree placement. Never confuse the configured artifact root with a Git worktree directory.

## Output

Report:

- full workspace path;
- branch or detached state;
- creation mechanism;
- baseline command and result;
- any pre-existing dirty or failing state.

## Safety Rules

- Never create a nested worktree.
- Never use manual Git worktree commands when the harness owns worktree lifecycle.
- Never place a project-local worktree in a tracked directory.
- Never delete or clean a worktree in this skill; branch completion belongs to `ulw-finish`.
- Never expose or embed credentials while repairing submodule remotes.

## Verification Checklist

- [ ] Existing isolation and submodule state detected correctly.
- [ ] Repository and user policy followed.
- [ ] Native mechanism preferred.
- [ ] Manual target directory ignored when fallback used.
- [ ] Baseline verification recorded.
- [ ] No cleanup or branch deletion performed.
