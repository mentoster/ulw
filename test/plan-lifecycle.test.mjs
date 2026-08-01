import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const bin = resolve("cli/bin/ulw.mjs");

async function fixtureWorkspace() {
  const workspace = await mkdtemp(join(tmpdir(), "ulw-lifecycle-"));
  await writeFile(join(workspace, "AGENTS.md"), "# Fixture\n");
  await mkdir(join(workspace, ".hermes", "ulw", "fixture", "inputs"), { recursive: true });
  await cp(resolve("test/fixtures/valid-plan-input.json"), join(workspace, ".hermes", "ulw", "fixture", "inputs", "plan.json"));
  return workspace;
}

function run(workspace, args) {
  return spawnSync(process.execPath, [bin, ...args, "--workspace", workspace, "--json"], { encoding: "utf8" });
}

test("plan lifecycle transitions from init through explicit approval", async () => {
  const workspace = await fixtureWorkspace();
  const initialized = run(workspace, ["plan", "init", "fixture", "--intent", "clear", "--depth", "standard"]);
  assert.equal(initialized.status, 0);
  const resumed = run(workspace, ["plan", "init", "fixture", "--intent", "clear", "--depth", "standard"]);
  assert.equal(resumed.status, 0, resumed.stderr);
  assert.equal(JSON.parse(resumed.stdout).resumed, true);
  const conflict = run(workspace, ["plan", "init", "fixture", "--intent", "unclear", "--depth", "standard"]);
  assert.notEqual(conflict.status, 0);
  assert.match(conflict.stderr, /PLAN_INIT_CONFLICT/);
  const imported = run(workspace, ["plan", "import", "fixture", "--file", ".hermes/ulw/fixture/inputs/plan.json"]);
  assert.equal(imported.status, 0, imported.stderr);
  assert.equal(JSON.parse(imported.stdout).status, "awaiting-approval");
  const next = run(workspace, ["plan", "next", "fixture"]);
  assert.equal(JSON.parse(next.stdout).action, "await-user-approval");
  const approved = run(workspace, ["plan", "approve", "fixture"]);
  assert.equal(approved.status, 0, approved.stderr);
  assert.equal(JSON.parse(approved.stdout).status, "approved");
  const state = JSON.parse(await readFile(join(workspace, ".hermes", "ulw", "fixture", "state.json"), "utf8"));
  assert.ok(state.approval.snapshotSha256);
  const resumedApproval = run(workspace, ["plan", "approve", "fixture"]);
  assert.equal(resumedApproval.status, 0, resumedApproval.stderr);
  assert.equal(JSON.parse(resumedApproval.stdout).resumed, true);
});

test("plan import rejects unknown fields and premature approval", async () => {
  const workspace = await fixtureWorkspace();
  run(workspace, ["plan", "init", "fixture", "--intent", "clear", "--depth", "standard"]);
  await writeFile(join(workspace, "bad.json"), JSON.stringify({ review: { forged: true } }));
  const imported = run(workspace, ["plan", "import", "fixture", "--file", "bad.json"]);
  assert.notEqual(imported.status, 0);
  assert.match(imported.stderr, /PLAN_INPUT_UNKNOWN_FIELDS/);
  const approved = run(workspace, ["plan", "approve", "fixture"]);
  assert.notEqual(approved.status, 0);
  assert.match(approved.stderr, /PLAN_APPROVAL_STATE/);
});

test("plan check reports generated Markdown drift", async () => {
  const workspace = await fixtureWorkspace();
  run(workspace, ["plan", "init", "fixture", "--intent", "clear", "--depth", "standard"]);
  run(workspace, ["plan", "import", "fixture", "--file", ".hermes/ulw/fixture/inputs/plan.json"]);
  await writeFile(join(workspace, ".hermes", "plans", "fixture.md"), "manually edited\n");
  const checked = run(workspace, ["plan", "check", "fixture"]);
  assert.notEqual(checked.status, 0);
  assert.ok(JSON.parse(checked.stdout).diagnostics.some((item) => item.code === "GENERATED_DRIFT"));
  const approved = run(workspace, ["plan", "approve", "fixture"]);
  assert.notEqual(approved.status, 0);
  assert.match(approved.stderr, /GENERATED_STATE_BLOCKED/);
});
