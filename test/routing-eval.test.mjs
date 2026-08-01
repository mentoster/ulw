import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { loadRoutingCorpus, loadRoutingThresholds } from "../cli/src/evals/routing-corpus.mjs";
import { runRoutingCorpus } from "../cli/src/evals/routing-runner.mjs";
import { scoreRoutingResults, validateRoutingResults } from "../cli/src/evals/routing-score.mjs";

test("fixture runner executes and scores the full corpus", async () => {
  const cases = await loadRoutingCorpus("evals/routing/cases.jsonl");
  const results = await runRoutingCorpus(cases, { runner: "evals/routing/fixture-runner.mjs" });
  assert.equal(results.length, 80);
  assert.equal(results.filter((item) => item.runnerError).length, 0);
  const scored = scoreRoutingResults(results, await loadRoutingThresholds("evals/routing/thresholds.json"));
  assert.equal(scored.passed, true, scored.violations.join("\n"));
  assert.equal(scored.report.overall.micro.f1, 1);
  assert.equal(scored.report.siblingCollisionRate, 0);
  assert.equal(scored.report.expectedNullFalsePositiveRate, 0);
});

test("scorer reports imperfect routing and threshold failures", async () => {
  const cases = await loadRoutingCorpus("evals/routing/cases.jsonl");
  const results = await runRoutingCorpus(cases, { runner: "evals/routing/fixture-runner.mjs" });
  results[0].selectedSkill = null;
  results[1].selectedSkill = "ulw-execute";
  const strict = await loadRoutingThresholds("evals/routing/thresholds.json");
  strict.overall.microF1 = 1;
  const scored = scoreRoutingResults(results, strict);
  assert.equal(scored.passed, false);
  assert.ok(scored.violations.some((item) => item.includes("overall micro F1")));
});

test("result validation rejects duplicates and missing cases", async () => {
  const cases = await loadRoutingCorpus("evals/routing/cases.jsonl");
  const results = await runRoutingCorpus(cases, { runner: "evals/routing/fixture-runner.mjs" });
  results[1].id = results[0].id;
  results.pop();
  const errors = validateRoutingResults(results).join("\n");
  assert.match(errors, /duplicate result id/);
  assert.match(errors, /expected 80 results, got 79/);
});

test("real eval CLI persists replayable JSONL and returns nonzero on runner errors", async () => {
  const root = await mkdtemp(join(tmpdir(), "ulw-routing-cli-"));
  const resultsPath = join(root, "results.jsonl");
  const run = spawnSync(process.execPath, ["cli/bin/ulw.mjs", "eval", "run", "--runner", "evals/routing/fixture-runner.mjs", "--output", resultsPath, "--json"], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  assert.equal((await readFile(resultsPath, "utf8")).trim().split("\n").length, 80);
  const score = spawnSync(process.execPath, ["cli/bin/ulw.mjs", "eval", "score", "--results", resultsPath, "--json"], { encoding: "utf8" });
  assert.equal(score.status, 0, score.stderr);
  assert.equal(JSON.parse(score.stdout).passed, true);

  const broken = join(root, "broken.mjs");
  await writeFile(broken, "process.stdin.resume(); process.stdin.on('end', () => process.stdout.write('not json'));\n");
  const brokenPath = join(root, "broken-results.jsonl");
  const failed = spawnSync(process.execPath, ["cli/bin/ulw.mjs", "eval", "run", "--runner", broken, "--output", brokenPath, "--timeout-ms", "1000", "--json"], { encoding: "utf8" });
  assert.notEqual(failed.status, 0);
  assert.equal((await readFile(brokenPath, "utf8")).trim().split("\n").length, 80);
});
