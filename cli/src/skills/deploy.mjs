import { executeSkillInstall } from "./install-transaction.mjs";

export async function deploySkills(skillsRoot, options = {}) {
  return executeSkillInstall(skillsRoot, { ...options, operation: options.operation ?? "deploy" });
}
