import { parseOptions } from "../args.mjs";
import { CliError } from "../errors.mjs";
import { mutationActions, planSkillActions } from "../skills/action-plan.mjs";
import { checkSkillsRoot } from "../skills/check.mjs";
import { FAMILY } from "../skills/constants.mjs";
import { executeSkillInstall } from "../skills/install-transaction.mjs";
import { readInstallManifest } from "../skills/transaction-store.mjs";
import { output } from "./command-io.mjs";

async function handler(argv, io, runtimeContext) {
  const { options } = parseOptions(argv, {
    "dry-run": "boolean",
    json: "boolean",
  });
  const skillsRoot = runtimeContext.skillsRoot;
  const dryRun = Boolean(options["dry-run"]);
  const existingManifest = await readInstallManifest(skillsRoot);
  if (existingManifest?.status === "installed" && mutationActions(await planSkillActions(skillsRoot)).length > 0) {
    throw new CliError("skills are already installed and differ from this package; use `ulw skill update`", { code: "SKILL_UPDATE_REQUIRED" });
  }
  const deployed = await executeSkillInstall(skillsRoot, { dryRun, operation: "install" });

  if (dryRun) {
    output(io, { ok: true, dryRun, skillsRoot, bundledSkills: FAMILY, actions: deployed.actions, summary: deployed.summary, changed: deployed.changed }, options.json);
    return 0;
  }

  const errors = await checkSkillsRoot(skillsRoot);
  if (errors.length > 0) {
    throw new CliError("skill installation failed post-install validation", {
      code: "SKILL_INSTALL_INVALID",
      details: errors,
    });
  }
  output(io, {
    ok: true,
    dryRun: false,
    skillsRoot,
    installedSkills: FAMILY,
    actions: deployed.actions,
    summary: deployed.summary,
    changed: deployed.changed,
    transactionId: deployed.transactionId,
  }, options.json);
  return 0;
}

export function register(registerCommand) {
  registerCommand("skill", "install", handler);
}
