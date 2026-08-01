import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { hashTree } from "../cli/src/skills/tree-hash.mjs";

const CLI = resolve("cli/bin/ulw.mjs");

function run(args, { cwd = process.cwd(), expect = 0 } = {}) {
  const result = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8" });
  assert.equal(result.status, expect, result.stderr || result.stdout);
  return result;
}

async function fixtureCopy(name) {
  const source = resolve("test", "fixtures", "repos", name);
  const sourceHash = await hashTree(source);
  const parent = await mkdtemp(join(tmpdir(), `ulw-${name}-`));
  const target = join(parent, "repo");
  await cp(source, target, { recursive: true });
  for (const args of [["init", "-q"], ["config", "user.email", "fixture@example.invalid"], ["config", "user.name", "ULW Fixture"], ["add", "."], ["commit", "-qm", "fixture"]]) {
    const git = spawnSync("git", ["-C", target, ...args], { encoding: "utf8" });
    assert.equal(git.status, 0, git.stderr);
  }
  return { source, sourceHash, target };
}

test("node-service fixture runs real plan, install, and routing CLI paths", async () => {
  const fixture = await fixtureCopy("node-service");
  const skillsRoot = join(fixture.target, ".test-skills");
  run(["plan", "init", "fixture-plan", "--intent", "clear", "--depth", "quick", "--workspace", fixture.target, "--json"]);
  run(["plan", "snapshot", "fixture-plan", "--workspace", fixture.target, "--json"]);
  const state = JSON.parse(await readFile(join(fixture.target, ".hermes", "ulw", "fixture-plan", "state.json"), "utf8"));
  assert.deepEqual(state.repository.instructions, ["AGENTS.md"]);
  assert.deepEqual(state.repository.manifests, ["package.json"]);
  run(["skill", "install", "--skills-root", skillsRoot, "--json"]);
  run(["skill", "check", "--skills-root", skillsRoot, "--json"]);
  const results = join(fixture.target, "routing.jsonl");
  run(["eval", "run", "--corpus", resolve("evals/routing/cases.jsonl"), "--runner", resolve("evals/routing/fixture-runner.mjs"), "--output", results, "--json"]);
  run(["eval", "score", "--results", results, "--thresholds", resolve("evals/routing/thresholds.json"), "--json"]);
  assert.equal(await hashTree(fixture.source), fixture.sourceHash);
});

test("monorepo fixture discovers root and nested instruction ownership", async () => {
  const fixture = await fixtureCopy("monorepo");
  run(["plan", "init", "monorepo-plan", "--intent", "clear", "--depth", "standard", "--workspace", fixture.target, "--json"]);
  const state = JSON.parse(await readFile(join(fixture.target, ".hermes", "ulw", "monorepo-plan", "state.json"), "utf8"));
  assert.deepEqual(state.repository.instructions, ["AGENTS.md", "packages/api/AGENTS.md"]);
  assert.deepEqual(state.repository.manifests, ["package.json", "packages/api/package.json"]);
  assert.equal(await hashTree(fixture.source), fixture.sourceHash);
});

test("historical fixture remains unmanaged and is not inferred into state", async () => {
  const fixture = await fixtureCopy("historical-plan");
  const historical = await readFile(join(fixture.target, "legacy-plan.md"), "utf8");
  assert.doesNotMatch(historical, /^<!-- ulw-managed/);
  const result = run(["plan", "check", "legacy-plan", "--workspace", fixture.target, "--json"], { expect: 1 });
  assert.match(result.stderr, /STATE_NOT_FOUND/);
  assert.equal(await readFile(join(fixture.target, "legacy-plan.md"), "utf8"), historical);
  assert.equal(await hashTree(fixture.source), fixture.sourceHash);
});
