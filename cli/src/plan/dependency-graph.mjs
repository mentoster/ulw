export function validateDependencyGraph(todos) {
  const diagnostics = [];
  const byId = new Map();
  for (const todo of todos) {
    if (byId.has(todo.id)) diagnostics.push({ code: "PLAN_DUPLICATE_TODO", path: `todos.${todo.id}`, message: `duplicate todo id: ${todo.id}` });
    byId.set(todo.id, todo);
  }
  for (const todo of todos) {
    for (const dependency of todo.dependsOn) {
      if (!byId.has(dependency)) diagnostics.push({ code: "PLAN_MISSING_DEPENDENCY", path: `todos.${todo.id}.dependsOn`, message: `unknown dependency: ${dependency}` });
      else if (!byId.get(dependency).blocks.includes(todo.id)) diagnostics.push({ code: "PLAN_BLOCKS_MISMATCH", path: `todos.${dependency}.blocks`, message: `${dependency} must block ${todo.id}` });
    }
    for (const blocked of todo.blocks) {
      if (!byId.has(blocked)) diagnostics.push({ code: "PLAN_MISSING_BLOCKED_TODO", path: `todos.${todo.id}.blocks`, message: `unknown blocked todo: ${blocked}` });
      else if (!byId.get(blocked).dependsOn.includes(todo.id)) diagnostics.push({ code: "PLAN_DEPENDS_MISMATCH", path: `todos.${blocked}.dependsOn`, message: `${blocked} must depend on ${todo.id}` });
    }
  }

  const visiting = new Set();
  const visited = new Set();
  function visit(id, path = []) {
    if (visiting.has(id)) {
      diagnostics.push({ code: "PLAN_DEPENDENCY_CYCLE", path: `todos.${id}`, message: `dependency cycle: ${[...path, id].join(" -> ")}` });
      return;
    }
    if (visited.has(id) || !byId.has(id)) return;
    visiting.add(id);
    for (const dependency of byId.get(id).dependsOn) visit(dependency, [...path, id]);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of byId.keys()) visit(id);
  return diagnostics;
}
