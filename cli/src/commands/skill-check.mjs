import { parseOptions } from "../args.mjs";
import { checkSkillsRoot } from "../skills/check.mjs";
import { output } from "./command-io.mjs";

async function handler(argv, io, runtimeContext) {
  const { options } = parseOptions(argv, { json: "boolean" });
  const errors = await checkSkillsRoot(runtimeContext.skillsRoot);
  output(io, { ok: errors.length === 0, skillsRoot: runtimeContext.skillsRoot, errors }, options.json);
  return errors.length ? 1 : 0;
}
export function register(registerCommand) { registerCommand("skill", "check", handler); }
