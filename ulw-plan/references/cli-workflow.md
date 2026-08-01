# ULW CLI Contract

## State and Generated Files

- Canonical state: `<artifact-root>/ulw/<slug>/state.json`
- Semantic inputs: `<artifact-root>/ulw/<slug>/inputs/*.json`
- Generated draft: `<artifact-root>/drafts/<slug>.md`
- Generated plan: `<artifact-root>/plans/<slug>.md`
- Review artifacts: `<artifact-root>/ulw/<slug>/reviews/round-<N>/`

The legacy profile uses `.hermes`; project-local uses `.ulw`. Every command
resolves one runtime context from explicit global options, `.ulw/config.json`,
and then the selected built-in profile. Reuse the same profile/config for the
entire lifecycle.

Files beginning with `<!-- ulw-managed` are CLI-managed. Direct changes are drift and block state mutations until rerendered or represented in semantic JSON.

## Lifecycle

```text
plan init
  -> plan snapshot/import/render/check/next
  -> explicit user approval in a later host turn
  -> host approval hook issues one short-lived grant
  -> plan approve
  -> review prepare
  -> two standard read-only sub review calls
  -> review record/status
  -> corrections and another round when needed
  -> plan finalize
  -> ulw-execute handoff
```

Schema version 1 state remains readable but is mutation-blocked. Use
`plan migrate --dry-run`, then explicit `--yes`, before schema or artifact-root
changes. Migration keeps backups, rejects destination collisions, and
invalidates stale approval/review receipts visibly.

## Command Families

```bash
ulw plan init <slug> --intent clear|unclear --depth quick|standard|architecture
ulw plan snapshot <slug>
ulw plan template --slug <slug> --json
ulw plan import <slug> --file <semantic.json>
ulw plan render <slug>
ulw plan check <slug> --json
ulw plan next <slug> --json
ulw plan approve <slug>
ulw plan migrate <slug> --dry-run --json
ulw plan migrate <slug> --yes --json
ulw plan migrate <slug> --to-profile project-local --dry-run --json
ulw review prepare <slug> --json
ulw review record <slug> --role plan-critic|architecture-verifier --file <result>
ulw review status <slug> --json
ulw plan finalize <slug> --json
ulw skill check --skills-root <path> --json
ulw skill deploy --skills-root <path> --dry-run --json
ulw skill install --skills-root <path> --dry-run --json
ulw skill update --skills-root <path> --dry-run --json
ulw skill update --skills-root <path> --allow-downgrade --json
ulw skill uninstall --skills-root <path> --dry-run --json
ulw skill migrate-legacy --skills-root <path> --dry-run --json
ulw skill migrate-legacy --skills-root <path> --yes --json
ulw skill rollback --skills-root <path> --json
ulw skill rollback --skills-root <path> --version <version> --json
ulw config init --profile project-local --json
ulw config show --json
ulw config check --json
ulw eval validate --corpus <cases.jsonl> --thresholds <thresholds.json> --json
ulw eval run --corpus <cases.jsonl> --runner <executable> --output <results.jsonl> --json
ulw eval score --results <results.jsonl> --thresholds <thresholds.json> --json
ulw doctor --json
```

In supported agent sessions, register `ulw-hermes-approval-gate` for both
`pre_llm_call` and `pre_tool_call`. The first hook receives the original user
message and issues a one-time grant only for an exact later approval such as
`approve` or `approve <slug>`. The second hook blocks a direct approval command
in a turn without that grant. `ulw plan approve` also consumes the grant, so a
different execution tool cannot bypass the pre-tool hook. The grant is bound
to the current generated-state digest; any plan edit invalidates it and needs a
new explicit approval turn. Direct operator CLI use outside an agent session
remains unchanged.

## Compatibility

Historical Markdown plans without the managed marker remain executable by `ulw-execute`. The CLI does not infer structured state from them. To modify or re-review one, the current agent reads it, creates semantic JSON, initializes/imports a managed plan, and lets the CLI generate new artifacts.

## Failure Rules

- Missing CLI or failing doctor: stop and report installation/remediation.
- Drift: rerender to discard accidental edits, or import the intended semantic change.
- Invalid state or plan: fix the cited JSON field; do not suppress diagnostics.
- Old structured state: inspect and explicitly confirm `plan migrate`; never
  silently upgrade on read.
- Stale review digest: revise/import and prepare a new round.
- Missing host approval grant: present the brief and end the turn; ask the
  user to send `approve` or `approve <slug>` as a new message. Never synthesize
  or infer that message.
- Blocked review or exhausted rounds: return to the unresolved owner decision/evidence.
- Doctor never deploys or migrates. Install/deploy only manage the five ULW
  trees; legacy removal and reference rewriting require an explicit
  `skill migrate-legacy --yes`. Successful mutations are manifest-backed and
  rollback refuses user-modified owned bytes. Installed bundle changes use
  `skill update`; safe uninstall leaves a tombstone and preserves unrelated or
  modified content. Downgrade requires an older verified package plus
  `--allow-downgrade`.
