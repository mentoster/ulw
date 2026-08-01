# ULW Routing Evaluations

`cases.jsonl` is the host-neutral routing corpus. Every line contains an id,
language, user prompt, expected ULW skill or `null`, case kind, and optional
collision group. The committed corpus is balanced between Russian and English
and covers positive routing, ULW sibling collisions, neighboring non-ULW
skills, ambiguous requests, and abstention.

Validate, run, and score separately:

```bash
ulw eval validate --corpus evals/routing/cases.jsonl --thresholds evals/routing/thresholds.json --json
ulw eval run --corpus evals/routing/cases.jsonl --runner evals/routing/fixture-runner.mjs --output /tmp/ulw-routing-results.jsonl --json
ulw eval score --results /tmp/ulw-routing-results.jsonl --thresholds evals/routing/thresholds.json --json
```

The runner receives one JSON object on stdin containing `id`, `language`,
`prompt`, and `availableSkills`. It returns exactly one JSON object:

```json
{"selectedSkill":"ulw-plan"}
```

or:

```json
{"selectedSkill":null}
```

The deterministic fixture runner exists to prove the corpus, process protocol,
raw-result persistence, scorer, and thresholds. Its score is not evidence of a
real model or host's routing quality. A live adapter must obey the same stdin /
stdout contract and keep credentials outside the corpus and result files.
