import { lstat, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { CLI_VERSION } from "../command-registry.mjs";
import { explicitLegacyReferences } from "./migrate-references.mjs";
import { FAMILY, FORBIDDEN_EXECUTION_TERMS, LEGACY_DIRECTORIES, STRICT_SINGLE_AGENT_FAMILY } from "./constants.mjs";
import { assertSkillsPathSafe } from "./path-policy.mjs";
import { parseSkillMetadata, validateSkillMetadata } from "./skill-metadata.mjs";
import { hashTree } from "./tree-hash.mjs";
import { controlPaths, readInstallManifest, readIntent } from "./transaction-store.mjs";

async function filesRecursively(root) {
  const output = [];
  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true }).catch(() => [])) {
      const path = join(current, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) output.push(path);
    }
  }
  await walk(root);
  return output;
}

export async function checkSkillDirectory(root, name, { expectedCliVersion = CLI_VERSION } = {}) {
  const errors = [];
  const skillFile = join(root, "SKILL.md");
  const text = await readFile(skillFile, "utf8").catch(() => null);
  if (text === null) return [`missing deployed skill: ${skillFile}`];
  try {
    const metadata = parseSkillMetadata(text, { path: skillFile });
    errors.push(...validateSkillMetadata(metadata, { expectedName: name, cliVersion: expectedCliVersion }).map((error) => `${skillFile}: ${error}`));
  } catch (error) {
    errors.push(error instanceof Error ? `${skillFile}: ${error.message}` : `${skillFile}: ${String(error)}`);
  }
  if (!name.startsWith("ulw-")) errors.push(`installable skill lacks ulw- prefix: ${name}`);
  if (STRICT_SINGLE_AGENT_FAMILY.includes(name)) {
    for (const path of await filesRecursively(root)) {
      if (!/\.(md|mjs|js|py)$/.test(path)) continue;
      const content = (await readFile(path, "utf8")).toLowerCase();
      for (const forbidden of FORBIDDEN_EXECUTION_TERMS) if (content.includes(forbidden)) errors.push(`ULW implementation must be single-agent: ${path}: ${forbidden}`);
    }
  }
  return errors;
}

async function checkPlannerContract(planRoot) {
  const errors = [];
  const planSkill = await readFile(join(planRoot, "SKILL.md"), "utf8").catch(() => "");
  for (const marker of ["standard `sub review`", "once for each generated prompt", "references/plan-critic-prompt.md", "references/architecture-verifier-prompt.md", "Plan critic: APPROVE", "Architecture verifier: APPROVE"]) {
    if (!planSkill.includes(marker)) errors.push(`missing mandatory plan-review contract: ${marker}`);
  }
  for (const filename of ["plan-critic-prompt.md", "architecture-verifier-prompt.md"]) {
    const path = join(planRoot, "references", filename);
    const prompt = await readFile(path, "utf8").catch(() => null);
    if (prompt === null) {
      errors.push(`missing mandatory plan-review prompt: ${path}`);
      continue;
    }
    for (const marker of ["READ-ONLY RULES", "REVIEW_CONTENT_SHA256", "VERDICT: APPROVE|CHANGES_REQUIRED|BLOCKED", "REQUIRED_CORRECTION", "Do not start another sub review", "Do not edit, create, delete, rename, stage, commit, or format files"]) {
      if (!prompt.includes(marker)) errors.push(`incomplete plan-review prompt: ${path}: ${marker}`);
    }
  }
  return errors;
}

export async function checkSkillsRoot(skillsRoot, { checkManifest = true, expectedCliVersion = null } = {}) {
  const errors = [];
  try {
    await assertSkillsPathSafe(skillsRoot);
    await assertSkillsPathSafe(join(skillsRoot, "software-development"));
    await assertSkillsPathSafe(controlPaths(skillsRoot).control);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    return errors;
  }
  const softwareRoot = join(skillsRoot, "software-development");
  let manifest = null;
  if (checkManifest) {
    try { manifest = await readInstallManifest(skillsRoot); }
    catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
  }
  if (manifest?.status === "uninstalled") {
    for (const name of FAMILY) if (await lstat(join(softwareRoot, name)).catch(() => null)) errors.push(`uninstalled tombstone drift: ${name} exists`);
  } else {
    const validationVersion = expectedCliVersion ?? (manifest?.status === "installed" ? manifest.packageVersion : CLI_VERSION);
    for (const name of FAMILY) errors.push(...await checkSkillDirectory(join(softwareRoot, name), name, { expectedCliVersion: validationVersion }));
    errors.push(...await checkPlannerContract(join(softwareRoot, "ulw-plan")));
  }

  if (checkManifest) {
    try {
      if (manifest?.status === "installed") {
        for (const [name, record] of Object.entries(manifest.skills)) {
          const checksum = await hashTree(join(skillsRoot, record.path));
          if (checksum !== record.checksum) errors.push(`installed skill checksum drift: ${name}`);
        }
      }
      if (await readIntent(skillsRoot)) errors.push("interrupted skill transaction marker exists");
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  return errors;
}

export async function checkLegacyCleanliness(skillsRoot) {
  const errors = [];
  for (const relative of LEGACY_DIRECTORIES) {
    const path = join(skillsRoot, relative);
    if (await lstat(path).catch(() => null)) errors.push(`legacy directory still exists: ${path}`);
  }
  errors.push(...await explicitLegacyReferences(skillsRoot));
  return errors;
}
