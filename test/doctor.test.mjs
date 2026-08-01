import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deploySkills } from "../cli/src/skills/deploy.mjs";
import { runDoctor } from "../cli/src/doctor/run-doctor.mjs";
import { CLI_VERSION } from "../cli/src/command-registry.mjs";

test("doctor reports a missing ulw bin without mutating PATH", async () => {
  const skillsRoot = await mkdtemp(join(tmpdir(), "ulw-doctor-skills-"));
  await deploySkills(skillsRoot);
  const before = process.env.PATH;
  const result = await runDoctor({ workspace: process.cwd(), skillsRoot, pathValue: "", binName: "ulw" });
  assert.equal(process.env.PATH, before);
  assert.ok(result.findings.some((item) => item.code === "DOCTOR_BIN" && item.severity === "warning"));
  assert.equal(result.ok, true);
});

test("doctor accepts an ordinary consumer workspace without ulw package metadata", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "ulw-doctor-consumer-"));
  const skillsRoot = await mkdtemp(join(tmpdir(), "ulw-doctor-consumer-skills-"));
  await writeFile(join(workspace, "package.json"), JSON.stringify({ name: "ordinary-app", private: true }));
  await deploySkills(skillsRoot);
  const result = await runDoctor({ workspace, skillsRoot, binName: "node" });
  assert.equal(result.ok, true, JSON.stringify(result.findings));
  assert.ok(result.findings.some((item) => item.code === "DOCTOR_PACKAGE" && item.severity === "ok" && item.message.includes("consumer project")));
});

test("doctor passes project and deployed skill checks through a real executable", async () => {
  const skillsRoot = await mkdtemp(join(tmpdir(), "ulw-doctor-skills-"));
  await deploySkills(skillsRoot);
  const result = await runDoctor({ workspace: process.cwd(), skillsRoot, binName: "node" });
  assert.equal(result.ok, true, JSON.stringify(result.findings));
  assert.ok(result.findings.some((item) => item.code === "DOCTOR_SKILLS" && item.severity === "ok"));
});

test("doctor rejects a deployed skill with a mismatched CLI version", async () => {
  const skillsRoot = await mkdtemp(join(tmpdir(), "ulw-doctor-version-"));
  await deploySkills(skillsRoot);
  const skillPath = join(skillsRoot, "software-development", "ulw-plan", "SKILL.md");
  await writeFile(skillPath, (await readFile(skillPath, "utf8")).replace(`ulw_cli_version: "${CLI_VERSION}"`, 'ulw_cli_version: "9.9.9"'));
  const result = await runDoctor({ workspace: process.cwd(), skillsRoot, binName: "node" });
  assert.equal(result.ok, false);
  assert.ok(result.findings.some((item) => item.code === "DOCTOR_SKILLS" && item.severity === "error"));
});

test("doctor reports legacy content as a migration warning rather than a failed install", async () => {
  const skillsRoot = await mkdtemp(join(tmpdir(), "ulw-doctor-legacy-"));
  await deploySkills(skillsRoot);
  const legacy = join(skillsRoot, "software-development", "using-superpowers");
  await mkdir(legacy, { recursive: true });
  await writeFile(join(legacy, "SKILL.md"), "legacy");
  const result = await runDoctor({ workspace: process.cwd(), skillsRoot, binName: "node" });
  assert.equal(result.ok, true, JSON.stringify(result.findings));
  assert.ok(result.findings.some((item) => item.code === "DOCTOR_LEGACY_MIGRATION_AVAILABLE" && item.severity === "warning"));
});
