import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDefaultState } from "../cli/src/state/default-state.mjs";
import { createState, loadState, mutateState, statePaths } from "../cli/src/state/store.mjs";
import { validateState } from "../cli/src/state/schema.mjs";

test("state store writes canonical JSON and immutable history", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "ulw-state-"));
  const initial = createDefaultState({ slug: "example", intent: "clear", depth: "standard", repository: {} });
  await createState(workspace, initial);
  const updated = await mutateState(workspace, "example", (state) => {
    state.findings.push({ text: "grounded", evidence: "README.md:1" });
    return state;
  });
  assert.equal(updated.revision, 1);
  assert.equal((await loadState(workspace, "example")).findings.length, 1);
  const paths = await statePaths(workspace, "example");
  assert.equal((await readdir(paths.history)).filter((name) => name.endsWith(".json")).length, 1);
});

test("state schema rejects unsupported versions and malformed todos", () => {
  const state = createDefaultState({ slug: "example", intent: "clear", depth: "standard", repository: {} });
  state.schemaVersion = 99;
  state.todos.push({ id: "T1" });
  const diagnostics = validateState(state);
  assert.ok(diagnostics.some((item) => item.code === "STATE_SCHEMA_VERSION"));
  assert.ok(diagnostics.some((item) => item.code === "STATE_TODO_REQUIRED"));
});

test("state schema rejects unknown nested fields", () => {
  const state = createDefaultState({ slug: "example", intent: "clear", depth: "standard", repository: {} });
  state.summary.unexpected = true;
  const diagnostics = validateState(state);
  assert.ok(diagnostics.some((item) => item.code === "STATE_UNKNOWN_FIELD" && item.path === "summary.unexpected"));
});

test("state history retains at most fifty ordinary revisions", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "ulw-history-"));
  await createState(workspace, createDefaultState({ slug: "history", intent: "clear", depth: "standard", repository: {} }));
  for (let index = 0; index < 55; index += 1) {
    await mutateState(workspace, "history", (state) => {
      state.findings = [{ text: `revision ${index}`, evidence: "README.md:1" }];
      return state;
    });
  }
  const paths = await statePaths(workspace, "history");
  const ordinary = (await readdir(paths.history)).filter((name) => name.includes("-ordinary-"));
  assert.equal(ordinary.length, 50);
});
