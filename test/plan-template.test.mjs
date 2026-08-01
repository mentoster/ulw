import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("plan template exposes the exact semantic input contract", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "ulw-template-"));
  const result = spawnSync(process.execPath, [
    "cli/bin/ulw.mjs", "plan", "template", "--slug", "sample-plan", "--workspace", workspace, "--json",
  ], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const template = JSON.parse(result.stdout);
  assert.deepEqual(Object.keys(template.components[0]), ["id", "outcome", "status", "evidence"]);
  assert.deepEqual(Object.keys(template.todos[0]), [
    "id", "title", "component", "files", "whatToDo", "mustNotDo", "dependsOn", "blocks",
    "references", "acceptance", "qaHappy", "qaFailure", "evidence", "commit",
  ]);
  assert.deepEqual(template.todos[0].files[0], { action: "create", path: "src/example.js" });
  assert.equal(template.verification.evidenceRoot, ".hermes/evidence/sample-plan/");
  assert.equal(template.readyForApproval, false);
});
