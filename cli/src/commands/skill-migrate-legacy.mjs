import { parseOptions } from "../args.mjs";
import { migrateLegacy } from "../skills/legacy-migration.mjs";
import { output } from "./command-io.mjs";

async function handler(argv, io, runtimeContext) {
  const { options } = parseOptions(argv, { "dry-run": "boolean", yes: "boolean", json: "boolean" });
  const result = await migrateLegacy(runtimeContext.skillsRoot, { dryRun: Boolean(options["dry-run"]), yes: Boolean(options.yes) });
  output(io, { ok: true, skillsRoot: runtimeContext.skillsRoot, dryRun: Boolean(options["dry-run"]), ...result }, options.json);
  return 0;
}

export function register(registerCommand) { registerCommand("skill", "migrate-legacy", handler); }
