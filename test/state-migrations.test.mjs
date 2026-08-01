import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { renderDraft } from "../cli/src/plan/render-draft.mjs";
import { renderPlan, semanticPlanSha256 } from "../cli/src/plan/render-plan.mjs";
import { createDefaultState } from "../cli/src/state/default-state.mjs";
import { sha256 } from "../cli/src/state/store.mjs";

const CLI = resolve("cli/bin/ulw.mjs");

function run(args, { expect = 0 } = {}) {
  const result = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
  assert.equal(result.status, expect, result.stderr || result.stdout);
  return result;
}

async function seedV1(workspace, slug, { approved = false } = {}) {
  const state = createDefaultState({ slug, intent: "clear", depth: "standard", repository: { workspaceRoot: workspace, git: null, instructions: ["AGENTS.md"], manifests: [], lockfiles: [], workflows: [], packages: [], capturedAt: new Date().toISOString() } });
  state.schemaVersion = 1;
  delete state.provenance;
  state.verification.evidenceRoot = `.hermes/evidence/${slug}/`;
  if (approved) {
    state.status = "approved";
    state.approval = { approvedAt: new Date().toISOString(), snapshotSha256: "a".repeat(64) };
    state.review = { maxRounds: 3, currentRound: 1, rounds: [{ round: 1, reviewContentSha256: "b".repeat(64), preparedAt: new Date().toISOString(), planCritic: null, architectureVerifier: null }], final: null };
  }
  const sourceStateSha256 = semanticPlanSha256(state);
  const draft = renderDraft(state, { sourceStateSha256 });
  const plan = renderPlan(state);
  state.generated = { sourceStateSha256, draftSha256: sha256(draft), planSha256: sha256(plan) };
  const root = join(workspace, ".hermes");
  await mkdir(join(root, "ulw", slug), { recursive: true });
  await mkdir(join(root, "drafts"), { recursive: true });
  await mkdir(join(root, "plans"), { recursive: true });
  await writeFile(join(root, "ulw", slug, "state.json"), `${JSON.stringify(state, null, 2)}\n`);
  await writeFile(join(root, "drafts", `${slug}.md`), draft);
  await writeFile(join(root, "plans", `${slug}.md`), plan);
  return state;
}

test("version 1 state is readable but mutating commands require migration", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "ulw-state-v1-read-"));
  await writeFile(join(workspace, "AGENTS.md"), "# Fixture\n");
  await seedV1(workspace, "legacy");
  const status = run(["review", "status", "legacy", "--workspace", workspace, "--json"]);
  assert.equal(JSON.parse(status.stdout).status, "drafting");
  const render = run(["plan", "render", "legacy", "--workspace", workspace, "--json"], { expect: 1 });
  assert.match(render.stderr, /STATE_MIGRATION_REQUIRED/);
  assert.match(render.stderr, /ulw plan migrate legacy/);
});

test("in-place migration requires confirmation, backs up v1, and invalidates review visibly", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "ulw-state-v1-inplace-"));
  await writeFile(join(workspace, "AGENTS.md"), "# Fixture\n");
  await seedV1(workspace, "legacy", { approved: true });
  const dry = JSON.parse(run(["plan", "migrate", "legacy", "--workspace", workspace, "--dry-run", "--json"]).stdout);
  assert.deepEqual(dry.actionPlan.steps, ["1-to-2"]);
  assert.equal(dry.actionPlan.reviewInvalidated, true);
  run(["plan", "migrate", "legacy", "--workspace", workspace, "--json"], { expect: 1 });
  const migrated = JSON.parse(run(["plan", "migrate", "legacy", "--workspace", workspace, "--yes", "--json"]).stdout);
  assert.ok(migrated.backupRoot);
  const state = JSON.parse(await readFile(join(workspace, ".hermes", "ulw", "legacy", "state.json"), "utf8"));
  assert.equal(state.schemaVersion, 2);
  assert.equal(state.provenance.profile, "legacy");
  assert.equal(state.status, "awaiting-approval");
  assert.equal(state.approval, null);
  assert.equal(state.review.rounds.length, 0);
  const backupState = JSON.parse(await readFile(join(migrated.backupRoot, "state-root", "state.json"), "utf8"));
  assert.equal(backupState.schemaVersion, 1);
  run(["plan", "render", "legacy", "--workspace", workspace, "--json"]);
});

test("migration can relocate a v1 plan to project-local artifacts", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "ulw-state-v1-move-"));
  await writeFile(join(workspace, "AGENTS.md"), "# Fixture\n");
  await seedV1(workspace, "move-me");
  const result = JSON.parse(run(["plan", "migrate", "move-me", "--workspace", workspace, "--to-profile", "project-local", "--yes", "--json"]).stdout);
  assert.equal(result.actionPlan.moveArtifacts, true);
  const state = JSON.parse(await readFile(join(workspace, ".ulw", "ulw", "move-me", "state.json"), "utf8"));
  assert.equal(state.schemaVersion, 2);
  assert.equal(state.provenance.profile, "project-local");
  assert.equal(state.provenance.artifactRoot, ".ulw");
  await assert.rejects(() => readFile(join(workspace, ".hermes", "ulw", "move-me", "state.json"), "utf8"), /ENOENT/);
  assert.match(await readFile(join(workspace, ".ulw", "plans", "move-me.md"), "utf8"), /\.ulw\/plans\/move-me\.md/);
});

test("destination collision and future state fail without changing source", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "ulw-state-v1-collision-"));
  await writeFile(join(workspace, "AGENTS.md"), "# Fixture\n");
  const original = await seedV1(workspace, "collision");
  await mkdir(join(workspace, ".ulw", "ulw", "collision"), { recursive: true });
  await writeFile(join(workspace, ".ulw", "ulw", "collision", "state.json"), "{}\n");
  run(["plan", "migrate", "collision", "--workspace", workspace, "--to-profile", "project-local", "--yes", "--json"], { expect: 1 });
  const unchanged = JSON.parse(await readFile(join(workspace, ".hermes", "ulw", "collision", "state.json"), "utf8"));
  assert.equal(unchanged.schemaVersion, original.schemaVersion);

  unchanged.schemaVersion = 99;
  await writeFile(join(workspace, ".hermes", "ulw", "collision", "state.json"), `${JSON.stringify(unchanged, null, 2)}\n`);
  const future = run(["review", "status", "collision", "--workspace", workspace, "--json"], { expect: 1 });
  assert.match(future.stderr, /STATE_SCHEMA_FUTURE/);
});
