import { parseOptions } from "../args.mjs";
import { deploySkills } from "../skills/deploy.mjs";
import { output } from "./command-io.mjs";

async function handler(argv, io, runtimeContext) {
  const { options } = parseOptions(argv, { "dry-run": "boolean", json: "boolean" });
  const result = await deploySkills(runtimeContext.skillsRoot, { dryRun: Boolean(options["dry-run"]) });
  output(io, { ok: true, skillsRoot: runtimeContext.skillsRoot, dryRun: Boolean(options["dry-run"]), actions: result.actions, summary: result.summary, changed: result.changed, transactionId: result.transactionId }, options.json);
  return 0;
}
export function register(registerCommand) { registerCommand("skill", "deploy", handler); }
