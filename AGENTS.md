# Repository Instructions

This repository is the canonical source for the local `ulw-*` workflow family
and the `ulw-cli` npm package.

## Architecture Boundaries

- `cli/` owns deterministic behavior: state, rendering, validation, lifecycle,
  review receipts, skill deployment, migration, rollback, and diagnostics.
- `ulw-plan` is the only coding-workflow planner and uses the CLI rather than
  duplicating deterministic algorithms in prose.
- `ulw-execute`, `ulw-review`, `ulw-worktree`, and `ulw-finish` remain strictly
  single-agent.
- `ulw-plan` alone may run standard `sub review` once for each of the two
  generated read-only final plan prompts.
- Treat resolved profile skill roots as deployed runtime state, never as
  source. The legacy default is `~/.hermes/skills`; project-local uses
  `.agents/skills`.
- Never deploy to the real runtime unless the user explicitly requests it.
- Do not modify the sibling OpenCode/oh-my-openagent checkout during normal
  development.

## Change Discipline

- Inspect `git status --short` before edits and preserve unrelated work.
- Use Node built-ins only; no runtime dependencies or build step.
- Keep command routing declarative and business logic in focused modules.
- Update an owning skill and its `references/evals.md` together.
- Add deterministic success and failure tests for CLI behavior.
- Keep generated artifact roots and evidence out of Git. The legacy profile
  uses `.hermes`; project-local uses `.ulw` and must not overwrite config.
- Do not reintroduce retired Python workflow tooling or a second state path.
- Keep package contents restricted by the `files` allowlist.
- Keep all five installable `ulw-*` skill directories in the repository and
  in the packed npm artifact.
- Keep `ulw skill install` as the simple checked installation path and
  `skill deploy` as the lower-level exact deployment operation over the same
  action/transaction engine. Neither command may delete legacy skills or
  rewrite neighboring Markdown; `skill migrate-legacy` owns that explicit,
  confirmed migration.
- Keep `skill update`, `skill uninstall`, and selected rollback on the same
  manifest/action/transaction engine. Never self-update the npm package or
  remove drifted/unrelated files.
- Keep transaction snapshots outside the configured skills root so recursive
  host scanners cannot discover backup `SKILL.md` files as live skills.
- Keep Hermes plan approval bound to host-issued evidence from the original
  user message in a later turn. Prompt text, model assertions, and visible
  nonces are not approval evidence; direct operator CLI use outside Hermes
  remains supported.
- Keep state upgrades explicit through `plan migrate`; schema reads must not
  silently write or relocate artifacts.
- Preserve upstream attribution and `THIRD_PARTY_NOTICES.md` when adapting
  ported content.

## Required Verification

Run from the repository root:

```bash
npm test
npm run check
npm pack --dry-run
```

For installation changes, also run `ulw skill install` against a temporary
skills root and confirm the installed family passes `ulw skill check`. Prove
that a second install is a byte-preserving no-op, that `migrate-legacy`
requires `--yes`, and that `skill rollback` restores a prior generation.

For profile/state changes, prove both built-in profiles, global/config
precedence, v1 read-only behavior, explicit migration, collision failure, and
backup restoration in temporary workspaces.

Also run the configured professional skill validator for every `ulw-*`
directory and the pinned official `npm run check:skills-spec` gate.

When changing deployment, also prove a temporary-root deploy/check and rollback
failure path. When changing packaging, install the packed tarball into a
temporary prefix and run the actual bin.

Before completion, inspect the final diff, pack manifest, evidence, commit log,
and `git status --short`. Real runtime deployment requires separate explicit
authorization. Do not claim operating-system compatibility that has not been
verified on that platform.
