import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { CliError } from "../errors.mjs";
import { resolveArtifactTarget } from "../io/path-policy.mjs";
import { sha256 } from "../state/store.mjs";

export async function checkGeneratedDrift(workspace, state) {
  const checks = [
    ["draft", await resolveArtifactTarget(workspace, join("drafts", `${state.slug}.md`)), state.generated.draftSha256],
    ["plan", await resolveArtifactTarget(workspace, join("plans", `${state.slug}.md`)), state.generated.planSha256],
  ];
  const diagnostics = [];
  for (const [kind, path, expected] of checks) {
    if (!expected) {
      diagnostics.push({ code: "GENERATED_NOT_RENDERED", path, message: `${kind} has not been rendered` });
      continue;
    }
    const content = await readFile(path, "utf8").catch(() => null);
    if (content === null) diagnostics.push({ code: "GENERATED_MISSING", path, message: `${kind} file is missing` });
    else if (sha256(content) !== expected) diagnostics.push({ code: "GENERATED_DRIFT", path, message: `${kind} differs from canonical state` });
  }
  return diagnostics;
}

export async function assertGeneratedClean(workspace, state) {
  const diagnostics = await checkGeneratedDrift(workspace, state);
  if (diagnostics.length > 0) {
    throw new CliError("generated artifacts are missing or drifted", {
      code: "GENERATED_STATE_BLOCKED",
      details: diagnostics.map((item) => `${item.code}: ${item.path}: ${item.message}`),
    });
  }
}
