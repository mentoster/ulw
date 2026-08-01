import { lstat } from "node:fs/promises";
import { resolve } from "node:path";
import { validateDependencyGraph } from "./dependency-graph.mjs";

function required(value, code, path, message, diagnostics) {
  if (typeof value !== "string" || value.trim() === "") diagnostics.push({ code, path, message });
}

function referencePath(reference) {
  const match = reference.match(/^(.*?)(?::\d+(?:-\d+)?)$/);
  return match ? { path: match[1], hasLocation: true } : { path: reference.replace(/\s+\(whole file\)$/i, ""), hasLocation: /\(whole file\)$/i.test(reference) };
}

export async function validatePlanState(state, workspace) {
  const workspaceRoot = typeof workspace === "string" ? workspace : workspace.workspace;
  const diagnostics = [];
  if (state.scope.mustHave.length === 0) diagnostics.push({ code: "PLAN_SCOPE_EMPTY", path: "scope.mustHave", message: "must-have scope is empty" });
  required(state.summary.whatYouGet, "PLAN_SUMMARY_MISSING", "summary.whatYouGet", "human deliverable summary is required", diagnostics);
  required(state.summary.whyThisApproach, "PLAN_APPROACH_MISSING", "summary.whyThisApproach", "approach rationale is required", diagnostics);
  if (state.components.length === 0) diagnostics.push({ code: "PLAN_COMPONENTS_EMPTY", path: "components", message: "at least one component is required" });
  const componentIds = new Set(state.components.map((item) => item.id));
  diagnostics.push(...validateDependencyGraph(state.todos));
  for (const todo of state.todos) {
    if (!componentIds.has(todo.component)) diagnostics.push({ code: "PLAN_ORPHAN_COMPONENT", path: `todos.${todo.id}.component`, message: `unknown component: ${todo.component}` });
    for (const key of ["whatToDo", "mustNotDo", "acceptance", "qaHappy", "qaFailure", "evidence", "commit"]) required(todo[key], "PLAN_TODO_INCOMPLETE", `todos.${todo.id}.${key}`, `${key} is required`, diagnostics);
    if (todo.references.length === 0) diagnostics.push({ code: "PLAN_REFERENCES_EMPTY", path: `todos.${todo.id}.references`, message: "at least one reference is required" });
    const futurePaths = new Set(todo.files.filter((file) => file.action === "create").map((file) => file.path));
    for (const reference of todo.references) {
      const parsed = referencePath(reference);
      if (!parsed.hasLocation) diagnostics.push({ code: "PLAN_REFERENCE_LOCATION", path: `todos.${todo.id}.references`, message: `reference needs line range or whole-file rationale: ${reference}` });
      if (futurePaths.has(parsed.path)) continue;
      const stat = await lstat(resolve(workspaceRoot, parsed.path)).catch(() => null);
      if (!stat?.isFile()) diagnostics.push({ code: "PLAN_REFERENCE_MISSING", path: `todos.${todo.id}.references`, message: `referenced file does not exist: ${parsed.path}` });
    }
  }
  const serialized = JSON.stringify(state);
  if (/<(?:fill|todo|pending|replace)[^>]*>/i.test(serialized)) diagnostics.push({ code: "PLAN_PLACEHOLDER", path: "$", message: "placeholder marker remains in state" });
  return diagnostics;
}
