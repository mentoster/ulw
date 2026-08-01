import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { lstat, mkdtemp, mkdir, readFile, readdir, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkLegacyCleanliness, checkSkillsRoot } from "../cli/src/skills/check.mjs";
import { deploySkills } from "../cli/src/skills/deploy.mjs";
import { migrateLegacy } from "../cli/src/skills/legacy-migration.mjs";
import { rollbackLatest } from "../cli/src/skills/install-transaction.mjs";
import { controlPaths, ensureControlRoot, legacyControlPaths, readInstallManifest, transactionRecords } from "../cli/src/skills/transaction-store.mjs";
import { CLI_VERSION } from "../cli/src/command-registry.mjs";

test("skill deploy is exact and leaves legacy content untouched", async () => {
  const root = await mkdtemp(join(tmpdir(), "ulw-skills-"));
  const software = join(root, "software-development");
  await mkdir(join(software, "using-superpowers"), { recursive: true });
  await writeFile(join(software, "using-superpowers", "SKILL.md"), "old");
  await mkdir(join(software, "neighbor"));
  const neighbor = join(software, "neighbor", "SKILL.md");
  const original = "---\nname: neighbor\nmetadata:\n  hermes:\n    related_skills: [plan, brainstorming, executing-plans]\n---\nUse `plan`, `brainstorming`, and `requesting-code-review`.\n";
  await writeFile(neighbor, original);

  const first = await deploySkills(root);
  assert.equal(first.summary.create.length, 5);
  assert.equal(await readFile(neighbor, "utf8"), original);
  assert.ok((await checkLegacyCleanliness(root)).length > 0);
  assert.deepEqual(await checkSkillsRoot(root), []);

  const before = await stat(join(software, "ulw-plan", "SKILL.md"));
  const generations = await transactionRecords(root);
  const second = await deploySkills(root);
  const after = await stat(join(software, "ulw-plan", "SKILL.md"));
  assert.equal(second.summary.unchanged.length, 5);
  assert.deepEqual(second.changed, []);
  assert.equal(after.mtimeMs, before.mtimeMs);
  assert.equal((await transactionRecords(root)).length, generations.length);
});

test("legacy migration requires confirmation, rewrites exact references, and becomes a no-op", async () => {
  const root = await mkdtemp(join(tmpdir(), "ulw-skills-migrate-"));
  const software = join(root, "software-development");
  await deploySkills(root);
  await mkdir(join(software, "using-superpowers"), { recursive: true });
  await writeFile(join(software, "using-superpowers", "SKILL.md"), "old");
  await mkdir(join(software, "neighbor"));
  const neighbor = join(software, "neighbor", "SKILL.md");
  await writeFile(neighbor, "---\nname: neighbor\nmetadata:\n  hermes:\n    related_skills: [plan, brainstorming, executing-plans]\n---\nUse `plan`, `brainstorming`, and `requesting-code-review`.\n");

  const dryRun = await migrateLegacy(root, { dryRun: true });
  assert.ok(dryRun.summary.remove.length > 0);
  assert.ok(dryRun.summary.rewrite.includes(neighbor));
  await assert.rejects(() => migrateLegacy(root), /requires explicit --yes/);

  await migrateLegacy(root, { yes: true });
  const migrated = await readFile(neighbor, "utf8");
  assert.match(migrated, /related_skills: \[ulw-plan, ulw-execute\]/);
  assert.match(migrated, /`ulw-review`/);
  assert.deepEqual(await checkLegacyCleanliness(root), []);
  assert.deepEqual((await migrateLegacy(root, { dryRun: true })).changed, []);
});

test("skill deploy rolls back a forced post-check failure byte-for-byte", async () => {
  const root = await mkdtemp(join(tmpdir(), "ulw-skills-rollback-"));
  const software = join(root, "software-development");
  await mkdir(join(software, "ulw-plan"), { recursive: true });
  await writeFile(join(software, "ulw-plan", "SKILL.md"), "original bytes\n");
  await assert.rejects(() => deploySkills(root, { forcePostCheckFailure: true }), /post-deploy validation failed/);
  assert.equal(await readFile(join(software, "ulw-plan", "SKILL.md"), "utf8"), "original bytes\n");
});

test("legacy migration rolls back a forced post-check failure", async () => {
  const root = await mkdtemp(join(tmpdir(), "ulw-migration-rollback-"));
  await deploySkills(root);
  const legacy = join(root, "software-development", "using-superpowers");
  await mkdir(legacy, { recursive: true });
  await writeFile(join(legacy, "SKILL.md"), "legacy\n");
  await assert.rejects(() => migrateLegacy(root, { yes: true, forcePostCheckFailure: true }), /post-check failed/);
  assert.equal(await readFile(join(legacy, "SKILL.md"), "utf8"), "legacy\n");
});

test("skill deploy rejects a symlinked software-development root", async () => {
  const root = await mkdtemp(join(tmpdir(), "ulw-skills-link-"));
  const outside = await mkdtemp(join(tmpdir(), "ulw-skills-outside-"));
  await symlink(outside, join(root, "software-development"), process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(() => deploySkills(root), /SKILL_PATH_SYMLINK|skill path contains a symlink/);
  assert.deepEqual(await readFile(join(outside, "sentinel"), "utf8").catch(() => null), null);
});

test("skill install deploys and validates the bundled repository skills", async () => {
  const root = await mkdtemp(join(tmpdir(), "ulw-skills-install-"));
  const result = spawnSync(process.execPath, ["cli/bin/ulw.mjs", "skill", "install", "--skills-root", root, "--json"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const installed = JSON.parse(result.stdout);
  assert.equal(installed.ok, true);
  assert.equal(installed.summary.create.length, 5);
  assert.deepEqual(installed.installedSkills, ["ulw-plan", "ulw-execute", "ulw-review", "ulw-worktree", "ulw-finish"]);
  assert.deepEqual(await checkSkillsRoot(root), []);
  assert.equal((await readInstallManifest(root)).packageVersion, CLI_VERSION);
});

test("transaction snapshots live outside the discoverable skills root", async () => {
  const root = await mkdtemp(join(tmpdir(), "ulw-skills-control-"));
  await deploySkills(root);
  assert.equal(controlPaths(root).control.startsWith(`${root}/`), false);
  const discovered = [];
  async function walk(path) {
    for (const entry of await readdir(path, { withFileTypes: true }).catch(() => [])) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) await walk(child);
      else if (entry.isFile() && entry.name === "SKILL.md") discovered.push(child);
    }
  }
  await walk(root);
  assert.equal(discovered.length, 5);
  assert.ok(discovered.every((path) => path.includes("software-development")));
});

test("legacy in-root transaction state migrates atomically outside the skills root", async () => {
  const root = await mkdtemp(join(tmpdir(), "ulw-skills-control-migrate-"));
  const legacy = legacyControlPaths(root);
  await mkdir(legacy.transactions, { recursive: true });
  await writeFile(join(legacy.control, "marker.txt"), "legacy control bytes\n");
  const current = await ensureControlRoot(root);
  assert.equal(await lstat(legacy.control).catch(() => null), null);
  assert.equal(await readFile(join(current.control, "marker.txt"), "utf8"), "legacy control bytes\n");
});

test("skill rollback restores the previous installed generation", async () => {
  const root = await mkdtemp(join(tmpdir(), "ulw-skills-generation-"));
  await deploySkills(root);
  const target = join(root, "software-development", "ulw-plan", "SKILL.md");
  const original = await readFile(target, "utf8");
  await writeFile(target, `${original}\nlocal drift\n`);
  await deploySkills(root);
  assert.equal(await readFile(target, "utf8"), original);
  await rollbackLatest(root);
  assert.equal(await readFile(target, "utf8"), `${original}\nlocal drift\n`);
});

test("skill rollback refuses migration drift instead of overwriting user content", async () => {
  const root = await mkdtemp(join(tmpdir(), "ulw-migration-drift-"));
  await deploySkills(root);
  const legacy = join(root, "software-development", "using-superpowers");
  await mkdir(legacy, { recursive: true });
  await writeFile(join(legacy, "SKILL.md"), "legacy\n");
  await migrateLegacy(root, { yes: true });
  await mkdir(legacy, { recursive: true });
  await writeFile(join(legacy, "SKILL.md"), "new user bytes\n");
  await assert.rejects(() => rollbackLatest(root), /recreated after the recorded transaction/);
  assert.equal(await readFile(join(legacy, "SKILL.md"), "utf8"), "new user bytes\n");
});
