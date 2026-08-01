import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkSkillsRoot } from "../cli/src/skills/check.mjs";
import { deploySkills } from "../cli/src/skills/deploy.mjs";
import { parseSkillMetadata, validateSkillMetadata } from "../cli/src/skills/skill-metadata.mjs";
import { CLI_VERSION } from "../cli/src/command-registry.mjs";

test("source skill family passes machine-consumed invariants", async () => {
  const skillsRoot = await mkdtemp(join(tmpdir(), "ulw-contract-"));
  await deploySkills(skillsRoot);
  const errors = await checkSkillsRoot(skillsRoot);
  assert.deepEqual(errors, []);
});

test("all source skills use portable scalar metadata and explicit routing boundaries", async () => {
  for (const skill of ["ulw-plan", "ulw-execute", "ulw-review", "ulw-worktree", "ulw-finish"]) {
    const path = join(skill, "SKILL.md");
    const parsed = parseSkillMetadata(await readFile(path, "utf8"), { path });
    assert.deepEqual(validateSkillMetadata(parsed, { expectedName: skill, cliVersion: CLI_VERSION }), []);
    assert.equal(parsed.metadata.version, CLI_VERSION);
    assert.match(parsed.description, /Use when/);
    assert.match(parsed.description, /Do not use/);
  }
});

test("metadata parser rejects unsupported top-level and nested values", () => {
  assert.throws(() => parseSkillMetadata("---\nname: bad\ndescription: Use when x. Do not use y.\nplatforms: [linux]\n---\n"), /unsupported frontmatter field/);
  assert.throws(() => parseSkillMetadata("---\nname: bad\ndescription: Use when x. Do not use y.\nlicense: MIT\ncompatibility: Node\nmetadata:\n  author:\n    nested: value\n---\n"), /metadata values must be non-empty strings|nested frontmatter/);
});

test("planner routes deterministic work through the CLI", async () => {
  const planner = await readFile(join("ulw-plan", "SKILL.md"), "utf8");
  const workflow = await readFile(join("ulw-plan", "references", "cli-workflow.md"), "utf8");
  assert.match(planner, /ulw doctor --json/);
  assert.match(planner, /ulw plan import/);
  assert.match(planner, /ulw plan template/);
  assert.match(planner, /ulw review prepare/);
  assert.match(planner, /standard `sub review`/);
  assert.match(planner, /once for each generated prompt/);
  assert.doesNotMatch(planner, /subagent|Qwen|Codex|OpenCode CLI/);
  assert.match(workflow, /Canonical state/);
  assert.doesNotMatch(planner, /scaffold_plan\.py|tools\/deploy\.py/);
  assert.match(planner, /HARD TURN BOUNDARY/);
  assert.match(planner, /later, distinct user message/);
  assert.match(planner, /never call `ulw plan approve`/i);
});

test("installable skill prose is provider-neutral", async () => {
  for (const skill of ["ulw-plan", "ulw-execute", "ulw-review", "ulw-worktree", "ulw-finish"]) {
    const paths = [];
    async function walk(root) {
      for (const entry of await readdir(root, { withFileTypes: true })) {
        const path = join(root, entry.name);
        if (entry.isDirectory()) await walk(path);
        else if (entry.isFile() && path.endsWith(".md")) paths.push(path);
      }
    }
    await walk(skill);
    for (const path of paths) {
      const content = await readFile(path, "utf8");
      assert.doesNotMatch(content, /\bHermes\b/, path);
    }
  }
});

test("execution and review distinguish managed and historical plans", async () => {
  const execute = await readFile(join("ulw-execute", "SKILL.md"), "utf8");
  const review = await readFile(join("ulw-review", "SKILL.md"), "utf8");
  for (const content of [execute, review]) {
    assert.match(content, /<!-- ulw-managed/);
    assert.match(content, /historical Markdown plan/);
    assert.match(content, /Do not auto-convert|do not auto-convert/i);
  }
});
