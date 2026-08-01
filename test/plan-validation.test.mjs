import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import input from "./fixtures/valid-plan-input.json" with { type: "json" };
import { createDefaultState } from "../cli/src/state/default-state.mjs";
import { applyPlanInput } from "../cli/src/plan/input-schema.mjs";
import { validatePlanState } from "../cli/src/plan/validate-plan.mjs";

test("plan validation accepts a complete plan and rejects cycles", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "ulw-validate-"));
  await writeFile(join(workspace, "AGENTS.md"), "# Fixture\n");
  const state = applyPlanInput(createDefaultState({ slug: "fixture", intent: "clear", depth: "standard", repository: {} }), input);
  assert.deepEqual(await validatePlanState(state, workspace), []);
  const second = structuredClone(state.todos[0]);
  second.id = "T2";
  second.title = "Second";
  second.dependsOn = ["T1"];
  second.blocks = ["T1"];
  state.todos[0].dependsOn = ["T2"];
  state.todos[0].blocks = ["T2"];
  state.todos.push(second);
  const diagnostics = await validatePlanState(state, workspace);
  assert.ok(diagnostics.some((item) => item.code === "PLAN_DEPENDENCY_CYCLE"));
});

test("plan validation reports missing failure QA and invalid references", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "ulw-validate-"));
  const state = applyPlanInput(createDefaultState({ slug: "fixture", intent: "clear", depth: "standard", repository: {} }), input);
  state.todos[0].qaFailure = "";
  state.todos[0].references = ["missing.md:1"];
  const diagnostics = await validatePlanState(state, workspace);
  assert.ok(diagnostics.some((item) => item.code === "PLAN_TODO_INCOMPLETE"));
  assert.ok(diagnostics.some((item) => item.code === "PLAN_REFERENCE_MISSING"));
});
