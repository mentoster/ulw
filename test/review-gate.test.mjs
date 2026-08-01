import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const bin = resolve("cli/bin/ulw.mjs");
async function workspaceFixture() {
  const workspace = await mkdtemp(join(tmpdir(), "ulw-review-"));
  await writeFile(join(workspace, "AGENTS.md"), "# Fixture\n");
  await mkdir(join(workspace, ".hermes", "ulw", "fixture", "inputs"), { recursive: true });
  await cp(resolve("test/fixtures/valid-plan-input.json"), join(workspace, ".hermes", "ulw", "fixture", "inputs", "plan.json"));
  return workspace;
}
function run(workspace, args) { return spawnSync(process.execPath, [bin, ...args, "--workspace", workspace, "--json"], { encoding: "utf8" }); }
async function preparedFixture() {
  const workspace = await workspaceFixture();
  run(workspace, ["plan", "init", "fixture", "--intent", "clear", "--depth", "standard"]);
  run(workspace, ["plan", "import", "fixture", "--file", ".hermes/ulw/fixture/inputs/plan.json"]);
  run(workspace, ["plan", "approve", "fixture"]);
  const prepared = run(workspace, ["review", "prepare", "fixture"]);
  assert.equal(prepared.status, 0, prepared.stderr);
  return { workspace, prepared: JSON.parse(prepared.stdout) };
}
function approval(role, round, digest) {
  const label = role === "plan-critic" ? "Plan critic" : "Architecture verifier";
  return `ROLE: ${label}\nVERDICT: APPROVE\nREVIEW_ROUND: ${round}\nREVIEW_CONTENT_SHA256: ${digest}\nSUMMARY: Approved.\nFINDINGS:\nNONE\nUNVERIFIED:\nNONE\n`;
}

function finding(role, verdict, round, digest) {
  const label = role === "plan-critic" ? "Plan critic" : "Architecture verifier";
  return `ROLE: ${label}\nVERDICT: ${verdict}\nREVIEW_ROUND: ${round}\nREVIEW_CONTENT_SHA256: ${digest}\nSUMMARY: A correction is required.\nFINDINGS:\n- ID: TEST-001\n  SEVERITY: IMPORTANT\n  PLAN_LOCATION: T1\n  EVIDENCE: AGENTS.md:1\n  PROBLEM: Fixture issue\n  REQUIRED_CORRECTION: Change the fixture summary\nUNVERIFIED:\nNONE\n`;
}

test("review gate requires two same-digest approvals and finalizes", async () => {
  const { workspace, prepared } = await preparedFixture();
  const resumedPreparation = run(workspace, ["review", "prepare", "fixture"]);
  assert.equal(resumedPreparation.status, 0, resumedPreparation.stderr);
  assert.equal(JSON.parse(resumedPreparation.stdout).resumed, true);
  const criticPath = join(workspace, "critic.txt");
  const architecturePath = join(workspace, "architecture.txt");
  await writeFile(criticPath, approval("plan-critic", prepared.round, prepared.reviewContentSha256));
  await writeFile(architecturePath, approval("architecture-verifier", prepared.round, prepared.reviewContentSha256));
  assert.equal(run(workspace, ["review", "record", "fixture", "--role", "plan-critic", "--file", "critic.txt"]).status, 0);
  const resumedReceipt = run(workspace, ["review", "record", "fixture", "--role", "plan-critic", "--file", "critic.txt"]);
  assert.equal(resumedReceipt.status, 0, resumedReceipt.stderr);
  assert.equal(JSON.parse(resumedReceipt.stdout).resumed, true);
  const early = run(workspace, ["plan", "finalize", "fixture"]);
  assert.notEqual(early.status, 0);
  assert.match(early.stderr, /FINALIZE_APPROVALS_MISSING/);
  assert.equal(run(workspace, ["review", "record", "fixture", "--role", "architecture-verifier", "--file", "architecture.txt"]).status, 0);
  const finalized = run(workspace, ["plan", "finalize", "fixture"]);
  assert.equal(finalized.status, 0, finalized.stderr);
  const plan = await readFile(join(workspace, ".hermes", "plans", "fixture.md"), "utf8");
  assert.match(plan, /Plan critic: APPROVE/);
  assert.match(plan, /Architecture verifier: APPROVE/);
  assert.equal(JSON.parse(finalized.stdout).reviewContentSha256, prepared.reviewContentSha256);
  const resumed = run(workspace, ["plan", "finalize", "fixture"]);
  assert.equal(resumed.status, 0, resumed.stderr);
  assert.equal(JSON.parse(resumed.stdout).resumed, true);
  const history = await readdir(join(workspace, ".hermes", "ulw", "fixture", "history"));
  for (const checkpoint of ["approval", "prepared-review", "recorded-review", "finalized"]) {
    assert.ok(history.some((name) => name.includes(`-${checkpoint}-`)), checkpoint);
  }
});

test("review gate rejects mixed digest, wrong role, and malformed results", async () => {
  const { workspace, prepared } = await preparedFixture();
  await writeFile(join(workspace, "mixed.txt"), approval("plan-critic", prepared.round, "0".repeat(64)));
  const mixed = run(workspace, ["review", "record", "fixture", "--role", "plan-critic", "--file", "mixed.txt"]);
  assert.notEqual(mixed.status, 0);
  assert.match(mixed.stderr, /REVIEW_DIGEST_MISMATCH/);
  await writeFile(join(workspace, "wrong.txt"), approval("architecture-verifier", prepared.round, prepared.reviewContentSha256));
  const wrong = run(workspace, ["review", "record", "fixture", "--role", "plan-critic", "--file", "wrong.txt"]);
  assert.notEqual(wrong.status, 0);
  assert.match(wrong.stderr, /REVIEW_ROLE_MISMATCH/);
  await writeFile(join(workspace, "bad.txt"), "VERDICT: APPROVE\n");
  const bad = run(workspace, ["review", "record", "fixture", "--role", "plan-critic", "--file", "bad.txt"]);
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /REVIEW_RESULT_MALFORMED/);
  await writeFile(join(workspace, "unknown.txt"), `${approval("plan-critic", prepared.round, prepared.reviewContentSha256)}EXTRA_FIELD: ignored\n`);
  const unknown = run(workspace, ["review", "record", "fixture", "--role", "plan-critic", "--file", "unknown.txt"]);
  assert.notEqual(unknown.status, 0);
  assert.match(unknown.stderr, /REVIEW_UNKNOWN_FIELD/);
});

test("review gate surfaces changes required and blocked verdicts", async () => {
  const changes = await preparedFixture();
  await writeFile(join(changes.workspace, "changes.txt"), finding("plan-critic", "CHANGES_REQUIRED", changes.prepared.round, changes.prepared.reviewContentSha256));
  const changed = run(changes.workspace, ["review", "record", "fixture", "--role", "plan-critic", "--file", "changes.txt"]);
  assert.equal(changed.status, 0, changed.stderr);
  assert.equal(JSON.parse(changed.stdout).status, "revision-required");

  const blocked = await preparedFixture();
  await writeFile(join(blocked.workspace, "blocked.txt"), finding("architecture-verifier", "BLOCKED", blocked.prepared.round, blocked.prepared.reviewContentSha256));
  const recorded = run(blocked.workspace, ["review", "record", "fixture", "--role", "architecture-verifier", "--file", "blocked.txt"]);
  assert.equal(recorded.status, 0, recorded.stderr);
  assert.equal(JSON.parse(recorded.stdout).status, "blocked");
  const finalized = run(blocked.workspace, ["plan", "finalize", "fixture"]);
  assert.notEqual(finalized.status, 0);
});

test("review gate forbids a fourth review round", async () => {
  const { workspace } = await preparedFixture();
  for (let round = 1; round <= 3; round += 1) {
    const status = JSON.parse(run(workspace, ["review", "status", "fixture"]).stdout);
    await writeFile(join(workspace, `changes-${round}.txt`), finding("plan-critic", "CHANGES_REQUIRED", round, status.currentDigest));
    const recorded = run(workspace, ["review", "record", "fixture", "--role", "plan-critic", "--file", `changes-${round}.txt`]);
    assert.equal(recorded.status, 0, recorded.stderr);
    if (round === 3) assert.equal(JSON.parse(recorded.stdout).status, "blocked");
    const input = JSON.parse(await readFile(resolve("test/fixtures/valid-plan-input.json"), "utf8"));
    input.summary.whatYouGet = `A deterministic fixture plan revision ${round}`;
    input.readyForApproval = false;
    await writeFile(join(workspace, `revision-${round}.json`), JSON.stringify(input));
    const imported = run(workspace, ["plan", "import", "fixture", "--file", `revision-${round}.json`]);
    assert.equal(imported.status, 0, imported.stderr);
    if (round < 3) {
      const prepared = run(workspace, ["review", "prepare", "fixture"]);
      assert.equal(prepared.status, 0, prepared.stderr);
    }
  }
  const fourth = run(workspace, ["review", "prepare", "fixture"]);
  assert.notEqual(fourth.status, 0);
  assert.match(fourth.stderr, /REVIEW_MAX_ROUNDS/);
});
