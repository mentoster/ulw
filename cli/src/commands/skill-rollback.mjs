import { parseOptions } from "../args.mjs";
import { rollbackLatest } from "../skills/install-transaction.mjs";
import { restoreSkillSelection } from "../skills/lifecycle.mjs";
import { output } from "./command-io.mjs";

async function handler(argv, io, runtimeContext) {
  const { options } = parseOptions(argv, { version: "value", transaction: "value", "dry-run": "boolean", json: "boolean" });
  const result = options.version || options.transaction
    ? await restoreSkillSelection(runtimeContext.skillsRoot, { version: options.version, transactionId: options.transaction, dryRun: Boolean(options["dry-run"]) })
    : await rollbackLatest(runtimeContext.skillsRoot);
  output(io, { ok: true, skillsRoot: runtimeContext.skillsRoot, ...result }, options.json);
  return 0;
}

export function register(registerCommand) { registerCommand("skill", "rollback", handler); }
