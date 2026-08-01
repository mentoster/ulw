import test from "node:test";
import assert from "node:assert/strict";
import { skillsRefInvocation, validateOfficialSkills } from "../cli/src/skills/official-validator.mjs";

test("official validator uses the pinned skills-ref revision for every bundled skill", async () => {
  const calls = [];
  const result = await validateOfficialSkills({
    runner: async (command, args) => {
      calls.push({ command, args });
      return { stdout: "valid", stderr: "" };
    },
  });
  assert.equal(result.revision, "38a2ff82958afee88dadf4831509e6f7e9d8ef4e");
  assert.equal(calls.length, 5);
  for (const call of calls) {
    assert.equal(call.command, "uvx");
    assert.equal(call.args[0], "--from");
    assert.match(call.args[1], new RegExp(result.revision));
    assert.equal(call.args.at(-2), "validate");
  }
});

test("official validator propagates execution failures with remediation", async () => {
  await assert.rejects(
    () => validateOfficialSkills({ runner: async () => { const error = new Error("missing"); error.code = "ENOENT"; throw error; } }),
    /official skills-ref validation failed/,
  );
});

test("skills-ref invocation is deterministic", () => {
  assert.deepEqual(skillsRefInvocation("abc123", "/tmp/skill"), {
    command: "uvx",
    args: ["--from", "git+https://github.com/agentskills/agentskills@abc123#subdirectory=skills-ref", "skills-ref", "validate", "/tmp/skill"],
  });
});
