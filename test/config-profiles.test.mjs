import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const CLI = resolve("cli/bin/ulw.mjs");

function run(args, { cwd = process.cwd(), expect = 0 } = {}) {
  const result = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8" });
  assert.equal(result.status, expect, result.stderr || result.stdout);
  return result;
}

test("legacy and project-local profiles resolve deterministic roots", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "ulw-profile-"));
  const legacy = JSON.parse(run(["config", "show", "--workspace", workspace, "--json"]).stdout);
  assert.equal(legacy.profile, "legacy");
  assert.equal(legacy.artifactRoot, join(workspace, ".hermes"));
  assert.match(legacy.skillsRoot, /\.hermes[\\/]skills$/);

  const local = JSON.parse(run(["config", "show", "--workspace", workspace, "--profile", "project-local", "--json"]).stdout);
  assert.equal(local.profile, "project-local");
  assert.equal(local.artifactRoot, join(workspace, ".ulw"));
  assert.equal(local.skillsRoot, join(workspace, ".agents", "skills"));
});

test("project config is overridden by explicit runtime options", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "ulw-profile-precedence-"));
  await mkdir(join(workspace, ".ulw"), { recursive: true });
  await writeFile(join(workspace, ".ulw", "config.json"), JSON.stringify({ schemaVersion: 1, profile: "project-local", artifactRoot: ".custom-artifacts", skillsRoot: ".custom-skills", handoffTemplate: "RUN {planPath}", reviewCapability: "custom review" }));
  const configured = JSON.parse(run(["config", "show", "--workspace", workspace, "--json"]).stdout);
  assert.equal(configured.artifactRoot, join(workspace, ".custom-artifacts"));
  assert.equal(configured.skillsRoot, join(workspace, ".custom-skills"));
  const explicit = JSON.parse(run(["config", "show", "--workspace", workspace, "--artifact-root", ".explicit-artifacts", "--skills-root", ".explicit-skills", "--json"]).stdout);
  assert.equal(explicit.artifactRoot, join(workspace, ".explicit-artifacts"));
  assert.equal(explicit.skillsRoot, join(workspace, ".explicit-skills"));
});

test("config init writes a validated project configuration", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "ulw-profile-init-"));
  const result = JSON.parse(run(["config", "init", "--workspace", workspace, "--profile", "project-local", "--json"]).stdout);
  assert.equal(result.config.profile, "project-local");
  const written = JSON.parse(await readFile(join(workspace, ".ulw", "config.json"), "utf8"));
  assert.equal(written.artifactRoot, ".ulw");
  run(["config", "check", "--workspace", workspace, "--json"]);
  run(["config", "init", "--workspace", workspace, "--json"], { expect: 1 });
});

test("project-local plan and skill commands use configured roots", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "ulw-profile-lifecycle-"));
  await writeFile(join(workspace, "AGENTS.md"), "# Fixture\n");
  const git = spawnSync("git", ["-C", workspace, "init", "-q"], { encoding: "utf8" });
  assert.equal(git.status, 0, git.stderr);
  const init = JSON.parse(run(["plan", "init", "profile-plan", "--intent", "clear", "--depth", "quick", "--workspace", workspace, "--profile", "project-local", "--json"]).stdout);
  assert.equal(init.statePath, ".ulw/ulw/profile-plan/state.json");
  assert.ok(await readFile(join(workspace, ".ulw", "plans", "profile-plan.md"), "utf8"));
  const install = JSON.parse(run(["skill", "install", "--workspace", workspace, "--profile", "project-local", "--json"]).stdout);
  assert.equal(install.skillsRoot, join(workspace, ".agents", "skills"));
  assert.equal(install.summary.create.length, 5);
});

test("runtime context rejects unknown, escaping, and symlinked roots", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "ulw-profile-invalid-"));
  run(["config", "show", "--workspace", workspace, "--profile", "unknown", "--json"], { expect: 1 });
  run(["config", "show", "--workspace", workspace, "--artifact-root", "../escape", "--json"], { expect: 1 });
  const outside = await mkdtemp(join(tmpdir(), "ulw-profile-outside-"));
  await symlink(outside, join(workspace, "linked"), process.platform === "win32" ? "junction" : "dir");
  run(["config", "check", "--workspace", workspace, "--skills-root", "linked/skills", "--json"], { expect: 1 });
});
