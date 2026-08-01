import { parseOptions } from "../args.mjs";
import { CLI_VERSION } from "../command-registry.mjs";
import { CliError } from "../errors.mjs";
import { mutationActions, planSkillActions, summarizeActions } from "../skills/action-plan.mjs";
import { executeSkillInstall } from "../skills/install-transaction.mjs";
import { assertOwnedTreesMatch } from "../skills/lifecycle.mjs";
import { readInstallManifest } from "../skills/transaction-store.mjs";
import { compareVersions } from "../skills/version.mjs";
import { output } from "./command-io.mjs";

async function handler(argv, io, runtimeContext) {
  const { options } = parseOptions(argv, { "dry-run": "boolean", "allow-downgrade": "boolean", json: "boolean" });
  const current = await readInstallManifest(runtimeContext.skillsRoot);
  if (!current || current.status !== "installed") throw new CliError("skills are not currently installed; use `ulw skill install`", { code: "SKILL_UPDATE_NOT_INSTALLED" });
  await assertOwnedTreesMatch(runtimeContext.skillsRoot, current);
  const comparison = compareVersions(CLI_VERSION, current.packageVersion);
  if (comparison < 0 && !options["allow-downgrade"]) {
    throw new CliError(`refusing downgrade from ${current.packageVersion} to ${CLI_VERSION}`, {
      code: "SKILL_DOWNGRADE_CONFIRMATION_REQUIRED",
      details: ["Pass --allow-downgrade only after verifying the older package and its checksums."],
    });
  }
  const actions = await planSkillActions(runtimeContext.skillsRoot);
  const mutations = mutationActions(actions);
  if (mutations.length === 0) {
    output(io, { ok: true, skillsRoot: runtimeContext.skillsRoot, dryRun: Boolean(options["dry-run"]), changed: [], actions, summary: summarizeActions(actions), transactionId: null, installedVersion: current.packageVersion, runningVersion: CLI_VERSION, updateApplied: false }, options.json);
    return 0;
  }
  const result = await executeSkillInstall(runtimeContext.skillsRoot, { dryRun: Boolean(options["dry-run"]), operation: comparison < 0 ? "downgrade" : "update" });
  output(io, { ok: true, skillsRoot: runtimeContext.skillsRoot, dryRun: Boolean(options["dry-run"]), installedVersion: current.packageVersion, runningVersion: CLI_VERSION, updateApplied: !options["dry-run"], ...result }, options.json);
  return 0;
}
export function register(registerCommand) { registerCommand("skill", "update", handler); }
