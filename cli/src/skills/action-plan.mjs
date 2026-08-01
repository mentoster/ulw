import { join } from "node:path";
import { FAMILY, packageRoot } from "./constants.mjs";
import { hashTree } from "./tree-hash.mjs";

export const ACTION_ORDER = Object.freeze(["create", "update", "unchanged", "remove", "rewrite"]);

export async function planSkillActions(skillsRoot) {
  const softwareRoot = join(skillsRoot, "software-development");
  const actions = [];
  for (const name of FAMILY) {
    const source = join(packageRoot, name);
    const target = join(softwareRoot, name);
    const [oldChecksum, newChecksum] = await Promise.all([hashTree(target), hashTree(source)]);
    const operation = oldChecksum === null ? "create" : oldChecksum === newChecksum ? "unchanged" : "update";
    actions.push({
      skill: name,
      path: target,
      source,
      operation,
      oldChecksum,
      newChecksum,
      reason: operation === "create" ? "bundled skill is not installed" : operation === "update" ? "installed bytes differ from bundled bytes" : "installed bytes match bundled bytes",
    });
  }
  return actions;
}

export function summarizeActions(actions) {
  const summary = Object.fromEntries(ACTION_ORDER.map((operation) => [operation, []]));
  for (const action of actions) summary[action.operation].push(action.path);
  return summary;
}

export function mutationActions(actions) {
  return actions.filter((action) => action.operation !== "unchanged");
}
