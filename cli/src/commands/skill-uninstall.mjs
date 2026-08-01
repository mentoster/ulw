import { parseOptions } from "../args.mjs";
import { uninstallSkills } from "../skills/lifecycle.mjs";
import { output } from "./command-io.mjs";

async function handler(argv, io, runtimeContext) {
  const { options } = parseOptions(argv, { "dry-run": "boolean", json: "boolean" });
  const result = await uninstallSkills(runtimeContext.skillsRoot, { dryRun: Boolean(options["dry-run"]) });
  output(io, { ok: true, skillsRoot: runtimeContext.skillsRoot, dryRun: Boolean(options["dry-run"]), ...result }, options.json);
  return 0;
}
export function register(registerCommand) { registerCommand("skill", "uninstall", handler); }
