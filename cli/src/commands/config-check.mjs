import { parseOptions } from "../args.mjs";
import { contextSummary } from "../config/runtime-context.mjs";
import { assertNoSymlinkComponents } from "../io/path-policy.mjs";
import { assertSkillsPathSafe } from "../skills/path-policy.mjs";
import { output } from "./command-io.mjs";

async function handler(argv, io, runtimeContext) {
  const { options } = parseOptions(argv, { json: "boolean" });
  await assertNoSymlinkComponents(runtimeContext.workspace, runtimeContext.artifactRoot);
  await assertSkillsPathSafe(runtimeContext.skillsRoot);
  output(io, { ok: true, ...contextSummary(runtimeContext) }, options.json);
  return 0;
}
export function register(registerCommand) { registerCommand("config", "check", handler); }
