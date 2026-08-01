import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { CLI_VERSION } from "../cli/src/command-registry.mjs";
import { hashTree } from "../cli/src/skills/tree-hash.mjs";
import { controlPaths } from "../cli/src/skills/transaction-store.mjs";

const CLI = resolve("cli/bin/ulw.mjs");

function run(args, { expect = 0 } = {}) {
  const result = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
  assert.equal(result.status, expect, result.stderr || result.stdout);
  return result;
}

async function seedOlderInstalledBundle(skillsRoot, version = "0.3.0") {
  const manifestPath = controlPaths(skillsRoot).manifest;
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.cliVersion = version;
  manifest.packageVersion = version;
  for (const name of Object.keys(manifest.skills)) {
    const root = join(skillsRoot, manifest.skills[name].path);
    const skillPath = join(root, "SKILL.md");
    const current = await readFile(skillPath, "utf8");
    await writeFile(skillPath, current.replaceAll(`"${CLI_VERSION}"`, `"${version}"`));
    const checksum = await hashTree(root);
    manifest.skills[name].checksum = checksum;
    manifest.skills[name].sourceChecksum = checksum;
  }
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

test("install is first-install/no-op and directs changed bundles to update", async () => {
  const root = await mkdtemp(join(tmpdir(), "ulw-lifecycle-install-"));
  run(["skill", "install", "--skills-root", root, "--json"]);
  await seedOlderInstalledBundle(root);
  const install = run(["skill", "install", "--skills-root", root, "--json"], { expect: 1 });
  assert.match(install.stderr, /SKILL_UPDATE_REQUIRED/);
  const update = JSON.parse(run(["skill", "update", "--skills-root", root, "--json"]).stdout);
  assert.equal(update.updateApplied, true);
  assert.equal(update.manifest.packageVersion, CLI_VERSION);
  assert.equal(update.summary.update.length, 5);
  const noop = JSON.parse(run(["skill", "update", "--skills-root", root, "--json"]).stdout);
  assert.equal(noop.updateApplied, false);
  assert.equal(noop.transactionId, null);
});

test("update refuses drift and downgrade unless explicitly allowed", async () => {
  const root = await mkdtemp(join(tmpdir(), "ulw-lifecycle-drift-"));
  run(["skill", "install", "--skills-root", root, "--json"]);
  const plan = join(root, "software-development", "ulw-plan", "SKILL.md");
  await writeFile(plan, `${await readFile(plan, "utf8")}\nuser modification\n`);
  const drift = run(["skill", "update", "--skills-root", root, "--json"], { expect: 1 });
  assert.match(drift.stderr, /SKILL_LIFECYCLE_DRIFT/);

  const cleanRoot = await mkdtemp(join(tmpdir(), "ulw-lifecycle-downgrade-"));
  run(["skill", "install", "--skills-root", cleanRoot, "--json"]);
  const manifestPath = controlPaths(cleanRoot).manifest;
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.packageVersion = "9.0.0";
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const refused = run(["skill", "update", "--skills-root", cleanRoot, "--json"], { expect: 1 });
  assert.match(refused.stderr, /SKILL_DOWNGRADE_CONFIRMATION_REQUIRED/);
  const allowed = JSON.parse(run(["skill", "update", "--skills-root", cleanRoot, "--allow-downgrade", "--json"]).stdout);
  assert.equal(allowed.updateApplied, false);
});

test("selected version rollback restores verified retained bytes", async () => {
  const root = await mkdtemp(join(tmpdir(), "ulw-lifecycle-rollback-"));
  run(["skill", "install", "--skills-root", root, "--json"]);
  await seedOlderInstalledBundle(root, "0.3.0");
  run(["skill", "update", "--skills-root", root, "--json"]);
  const restored = JSON.parse(run(["skill", "rollback", "--skills-root", root, "--version", "0.3.0", "--json"]).stdout);
  assert.equal(restored.selected.version, "0.3.0");
  assert.equal(restored.manifest.packageVersion, "0.3.0");
  assert.match(await readFile(join(root, "software-development", "ulw-plan", "SKILL.md"), "utf8"), /ulw_cli_version: "0\.3\.0"/);
  const doctor = JSON.parse(run(["doctor", "--skills-root", root, "--json"]).stdout);
  assert.ok(doctor.findings.some((item) => item.code === "DOCTOR_SKILL_UPDATE_AVAILABLE"));
});

test("uninstall preserves unrelated content, writes tombstone, and can restore a retained version", async () => {
  const root = await mkdtemp(join(tmpdir(), "ulw-lifecycle-uninstall-"));
  run(["skill", "install", "--skills-root", root, "--json"]);
  const unrelated = join(root, "software-development", "neighbor", "SKILL.md");
  await mkdir(join(root, "software-development", "neighbor"), { recursive: true });
  await writeFile(unrelated, "neighbor bytes\n");
  const dry = JSON.parse(run(["skill", "uninstall", "--skills-root", root, "--dry-run", "--json"]).stdout);
  assert.equal(dry.summary.remove.length, 5);
  const removed = JSON.parse(run(["skill", "uninstall", "--skills-root", root, "--json"]).stdout);
  assert.equal(removed.manifest.status, "uninstalled");
  assert.equal(await readFile(unrelated, "utf8"), "neighbor bytes\n");
  run(["skill", "check", "--skills-root", root, "--json"]);
  const restored = JSON.parse(run(["skill", "rollback", "--skills-root", root, "--version", CLI_VERSION, "--json"]).stdout);
  assert.equal(restored.manifest.status, "installed");
  assert.ok(await readFile(join(root, "software-development", "ulw-plan", "SKILL.md"), "utf8"));
  assert.equal(await readFile(unrelated, "utf8"), "neighbor bytes\n");
});

test("uninstall refuses modified owned files", async () => {
  const root = await mkdtemp(join(tmpdir(), "ulw-lifecycle-uninstall-drift-"));
  run(["skill", "install", "--skills-root", root, "--json"]);
  const path = join(root, "software-development", "ulw-review", "SKILL.md");
  await writeFile(path, `${await readFile(path, "utf8")}\nmodified\n`);
  const result = run(["skill", "uninstall", "--skills-root", root, "--json"], { expect: 1 });
  assert.match(result.stderr, /SKILL_LIFECYCLE_DRIFT/);
  assert.match(await readFile(path, "utf8"), /modified/);
});
