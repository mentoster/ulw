import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { renderMarkdownCommandTable } from "../cli/src/command-registry.mjs";

test("README command table is generated from command registry metadata", async () => {
  const readme = await readFile("README.md", "utf8");
  const match = readme.match(/<!-- ULW_COMMAND_TABLE_START -->\n([\s\S]*?)\n<!-- ULW_COMMAND_TABLE_END -->/);
  assert.ok(match, "README command table markers are missing");
  assert.equal(match[1], renderMarkdownCommandTable());
});

test("README identifies the modified OpenCode port without official affiliation", async () => {
  const readme = await readFile("README.md", "utf8");
  assert.match(readme, /modified port/);
  assert.match(readme, /OpenCode/);
  assert.match(readme, /oh-my-openagent\/packages\/shared-skills\/skills\/ulw-plan\//);
  assert.match(readme, /ed0241d1a/);
  assert.match(readme, /not an official/i);
  assert.doesNotMatch(readme, /\bHermes\b/);
});

test("repository and package bundle all skills with simple setup commands", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  const skills = ["ulw-plan", "ulw-execute", "ulw-review", "ulw-worktree", "ulw-finish"];
  for (const skill of skills) {
    assert.ok(packageJson.files.includes(skill), `${skill} is missing from package files`);
    assert.match(await readFile(`${skill}/SKILL.md`, "utf8"), new RegExp(`^name: ${skill}$`, "m"));
  }
  assert.equal(packageJson.scripts.setup, "npm link && node cli/bin/ulw.mjs skill install");
  assert.equal(packageJson.scripts["install:skills"], "node cli/bin/ulw.mjs skill install");
  assert.equal(packageJson.bin.ulw, "cli/bin/ulw.mjs");
  assert.equal(packageJson.bin["ulw-hermes-approval-gate"], "cli/bin/ulw-hermes-approval-gate.mjs");
  assert.equal(packageJson.scripts["check:skills-spec"], "node cli/src/skills/official-validator.mjs");
  assert.equal(packageJson.scripts["eval:validate"], "node cli/bin/ulw.mjs eval validate --json");
  assert.match(packageJson.scripts["eval:fixture"], /evals\/routing\/fixture-runner\.mjs/);
  assert.equal(packageJson.scripts["eval:charts"], "node tools/render-evaluation-assets.mjs");
  assert.ok(packageJson.files.includes("tools/skills-ref-version.txt"));
  assert.ok(packageJson.files.includes("evals"));
  assert.ok(packageJson.files.includes("assets"));
  assert.ok(packageJson.files.includes("EVALUATION.md"));
  assert.ok(packageJson.files.includes("tools/render-evaluation-assets.mjs"));
  assert.ok(packageJson.files.includes("CHANGELOG.md"));
  assert.ok(packageJson.files.includes("RELEASE.md"));
  assert.equal(packageJson.private, true);
  assert.equal(packageJson.license, "MIT");
  assert.equal(packageJson.author, "mentoster");
  assert.equal(packageJson.repository.url, "git+https://github.com/mentoster/ulw.git");
  assert.equal(packageJson.homepage, "https://github.com/mentoster/ulw#readme");
  assert.equal(packageJson.bugs.url, "https://github.com/mentoster/ulw/issues");
  assert.equal(packageJson.scripts["release:package"], "node scripts/package-release.mjs");
  const readme = await readFile("README.md", "utf8");
  assert.match(readme, /npm run setup/);
  assert.match(readme, /ulw skill install/);
  assert.match(readme, /ulw skill migrate-legacy/);
  assert.match(readme, /ulw skill rollback/);
  assert.match(readme, /ulw eval validate/);
  assert.match(readme, /ulw eval score/);
  assert.match(readme, /ulw-hermes-approval-gate/);
  assert.match(readme, /pre_llm_call/);
  assert.match(readme, /pre_tool_call/);
  assert.match(readme, /assets\/ulw-mark\.svg/);
  assert.match(readme, /assets\/evaluation-current\.svg/);
  assert.match(readme, /assets\/qwen-before-after\.svg/);
  assert.match(readme, /EVALUATION\.md/);
  assert.doesNotMatch(readme, /GitHub Actions|CI\/CD/i);
});
