# Legacy implementation plan

## Scope

- Modify `AGENTS.md` only.
- Preserve every other file.

## Todo

1. Read `AGENTS.md`.
2. Apply the requested wording change.
3. Verify the final diff contains only `AGENTS.md`.

## Verification

- Happy path: `git diff -- AGENTS.md` shows the requested text.
- Failure path: unrelated paths remain byte-identical.
