# Changelog

## 0.5.2

- Added a Hermes approval-turn bridge that reads the host-provided original
  user message and issues a short-lived one-time grant only for an explicit
  later `approve` turn.
- Made `ulw plan approve` fail closed inside Hermes when no matching grant is
  present, while preserving direct operator CLI compatibility outside Hermes.
- Bound each grant to the exact generated-state digest so a semantic edit after
  approval requires a fresh user approval turn.
- Added regression coverage for Qwen hallucinating “The user approved the
  plan”, stale grants, ambiguous targets, and pre-tool blocking.

## 0.5.1

- Moved manifest snapshots and backups outside the discoverable skills root
  and added atomic migration from the old in-root `.ulw` location.
- Made `ulw doctor` accept ordinary consumer workspaces instead of requiring
  their `package.json` to describe `ulw-cli`.
- Added `ulw plan template` with the exact semantic input shape and strengthened
  the separate-turn approval gate after a real Hermes/Qwen evaluation.

## 0.5.0

- Added legacy and project-local host profiles, project config, global root
  overrides, profile-aware review paths and handoffs, and doctor context.
- Added state schema version 2 provenance plus explicit backup-backed
  `ulw plan migrate` for schema and artifact-root changes.
- Added deterministic tagged release packaging, tarball checksums, routing
  metrics, allowlist checks, and clean-prefix smoke.
- Added manifest-aware `skill update`, safe `skill uninstall`, downgrade
  confirmation, tombstones, retained snapshots, and selected version or
  transaction rollback.

## 0.4.0

- Added an 80-case balanced Russian and English routing corpus with explicit
  precision, recall, F1, sibling-collision, and abstention thresholds.
- Added `ulw eval validate`, `ulw eval run`, and `ulw eval score` with a safe
  executable protocol, raw JSONL persistence, replayable metrics, and nonzero
  threshold failures.
- Added representative Node service, nested-instruction monorepo, and
  historical-plan fixture repositories using the real CLI entrypoint.
- Added portable path contracts and local fixture coverage for supported Node
  versions.

## 0.3.0

- Made all five bundled skills compatible with the Agent Skills frontmatter
  specification and strengthened routing descriptions and eval examples.
- Added a pinned official `skills-ref` validation gate.
- Made skill installation exact and idempotent while preserving `skill deploy`
  as the lower-level command over the same engine.
- Separated destructive legacy cleanup into `skill migrate-legacy --yes`.
- Added persistent ownership manifests, SHA-256 tree records, bounded
  transaction backups, interrupted-transaction diagnostics, and
  `skill rollback`.
