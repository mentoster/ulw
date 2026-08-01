import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { CLI_VERSION } from "../cli/src/command-registry.mjs";
import { controlPaths } from "../cli/src/skills/transaction-store.mjs";

function run(command, args, { cwd = process.cwd(), expect = 0 } = {}) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  assert.equal(result.status, expect, result.stderr || result.stdout);
  return result.stdout.trim();
}

async function replace(path, from, to) {
  await writeFile(path, (await readFile(path, "utf8")).replaceAll(from, to));
}

test("packed 0.4 fixture upgrades, rolls back, uninstalls, restores, and runs current profile/state flows", async () => {
  const root = await mkdtemp(join(tmpdir(), "ulw-release-lifecycle-"));
  const currentPackDir = join(root, "current-pack");
  const oldPackDir = join(root, "old-pack");
  const oldSourceParent = join(root, "old-source");
  const oldPrefix = join(root, "old-prefix");
  const newPrefix = join(root, "new-prefix");
  const skillsRoot = join(root, "skills");
  await Promise.all([currentPackDir, oldPackDir, oldSourceParent, oldPrefix, newPrefix, skillsRoot].map((path) => mkdir(path, { recursive: true })));

  const currentName = run("npm", ["pack", "--pack-destination", currentPackDir, "--silent"]);
  const currentTarball = join(currentPackDir, currentName);
  const checksum = createHash("sha256").update(await readFile(currentTarball)).digest("hex");
  assert.match(checksum, /^[a-f0-9]{64}$/);

  run("tar", ["-xzf", currentTarball, "-C", oldSourceParent]);
  const oldSource = join(oldSourceParent, "package");
  const oldPackagePath = join(oldSource, "package.json");
  const oldPackage = JSON.parse(await readFile(oldPackagePath, "utf8"));
  oldPackage.version = "0.4.0";
  await writeFile(oldPackagePath, `${JSON.stringify(oldPackage, null, 2)}\n`);
  await replace(join(oldSource, "cli", "src", "command-registry.mjs"), `CLI_VERSION = "${CLI_VERSION}"`, 'CLI_VERSION = "0.4.0"');
  for (const skill of ["ulw-plan", "ulw-execute", "ulw-review", "ulw-worktree", "ulw-finish"]) {
    await replace(join(oldSource, skill, "SKILL.md"), `version: "${CLI_VERSION}"`, 'version: "0.4.0"');
    await replace(join(oldSource, skill, "SKILL.md"), `ulw_cli_version: "${CLI_VERSION}"`, 'ulw_cli_version: "0.4.0"');
  }
  const oldName = run("npm", ["pack", "--pack-destination", oldPackDir, "--silent"], { cwd: oldSource });
  const oldTarball = join(oldPackDir, oldName);

  run("npm", ["install", "--prefix", oldPrefix, oldTarball, "--silent"]);
  run("npm", ["install", "--prefix", newPrefix, currentTarball, "--silent"]);
  const oldBin = join(oldPrefix, "node_modules", ".bin", process.platform === "win32" ? "ulw.cmd" : "ulw");
  const newBin = join(newPrefix, "node_modules", ".bin", process.platform === "win32" ? "ulw.cmd" : "ulw");
  assert.equal(run(oldBin, ["--version"]), "0.4.0");
  assert.equal(run(newBin, ["--version"]), CLI_VERSION);

  run(oldBin, ["skill", "install", "--skills-root", skillsRoot, "--json"]);
  let manifest = JSON.parse(await readFile(controlPaths(skillsRoot).manifest, "utf8"));
  assert.equal(manifest.packageVersion, "0.4.0");
  run(newBin, ["skill", "update", "--skills-root", skillsRoot, "--json"]);
  manifest = JSON.parse(await readFile(controlPaths(skillsRoot).manifest, "utf8"));
  assert.equal(manifest.packageVersion, CLI_VERSION);
  run(newBin, ["skill", "rollback", "--skills-root", skillsRoot, "--version", "0.4.0", "--json"]);
  manifest = JSON.parse(await readFile(controlPaths(skillsRoot).manifest, "utf8"));
  assert.equal(manifest.packageVersion, "0.4.0");
  run(newBin, ["skill", "update", "--skills-root", skillsRoot, "--json"]);
  run(newBin, ["skill", "uninstall", "--skills-root", skillsRoot, "--json"]);
  manifest = JSON.parse(await readFile(controlPaths(skillsRoot).manifest, "utf8"));
  assert.equal(manifest.status, "uninstalled");
  run(newBin, ["skill", "rollback", "--skills-root", skillsRoot, "--version", CLI_VERSION, "--json"]);
  run(newBin, ["skill", "check", "--skills-root", skillsRoot, "--json"]);

  const newPackageRoot = join(newPrefix, "node_modules", "ulw-cli");
  const routingResults = join(root, "routing-results.jsonl");
  run(newBin, ["eval", "validate", "--corpus", join(newPackageRoot, "evals", "routing", "cases.jsonl"), "--thresholds", join(newPackageRoot, "evals", "routing", "thresholds.json"), "--json"]);
  run(newBin, ["eval", "run", "--corpus", join(newPackageRoot, "evals", "routing", "cases.jsonl"), "--runner", join(newPackageRoot, "evals", "routing", "fixture-runner.mjs"), "--output", routingResults, "--json"]);
  const score = JSON.parse(run(newBin, ["eval", "score", "--results", routingResults, "--thresholds", join(newPackageRoot, "evals", "routing", "thresholds.json"), "--json"]));
  assert.equal(score.passed, true);

  const profileWorkspace = join(root, "profile-workspace");
  await mkdir(profileWorkspace);
  await writeFile(join(profileWorkspace, "AGENTS.md"), "# Fixture\n");
  run("git", ["init", "-q"], { cwd: profileWorkspace });
  const profileInit = JSON.parse(run(newBin, ["plan", "init", "profile-e2e", "--intent", "clear", "--depth", "quick", "--workspace", profileWorkspace, "--profile", "project-local", "--json"]));
  assert.equal(profileInit.statePath, ".ulw/ulw/profile-e2e/state.json");

  const migrationWorkspace = join(root, "migration-workspace");
  await mkdir(migrationWorkspace);
  await writeFile(join(migrationWorkspace, "AGENTS.md"), "# Fixture\n");
  run("git", ["init", "-q"], { cwd: migrationWorkspace });
  run(newBin, ["plan", "init", "legacy-e2e", "--intent", "clear", "--depth", "quick", "--workspace", migrationWorkspace, "--json"]);
  const legacyStatePath = join(migrationWorkspace, ".hermes", "ulw", "legacy-e2e", "state.json");
  const legacyState = JSON.parse(await readFile(legacyStatePath, "utf8"));
  legacyState.schemaVersion = 1;
  delete legacyState.provenance;
  await writeFile(legacyStatePath, `${JSON.stringify(legacyState, null, 2)}\n`);
  const migration = JSON.parse(run(newBin, ["plan", "migrate", "legacy-e2e", "--workspace", migrationWorkspace, "--to-profile", "project-local", "--yes", "--json"]));
  assert.equal(migration.actionPlan.toProfile, "project-local");
  const migratedState = JSON.parse(await readFile(join(migrationWorkspace, ".ulw", "ulw", "legacy-e2e", "state.json"), "utf8"));
  assert.equal(migratedState.schemaVersion, 2);
  assert.equal(migratedState.provenance.profile, "project-local");
  assert.ok(basename(currentTarball).includes(CLI_VERSION));
});
