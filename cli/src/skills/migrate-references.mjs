import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { DIRECT_REPLACEMENTS, TARGETED_REPLACEMENTS } from "./constants.mjs";

const RELATED_REPLACEMENTS = { brainstorming: "ulw-plan", plan: "ulw-plan" };

export function migrateText(text) {
  const relatedBlocks = [...text.matchAll(/^\s*related_skills:\s*\[([^\]]*)\]/gm)];
  const relatedTokens = new Set(relatedBlocks.flatMap((match) => match[1].split(",").map((item) => item.trim()).filter(Boolean)));
  const explicitPlanView = text.includes('skill_view("plan")') || text.includes("skill_view('plan')");
  let migrated = text.replace(/(^\s*related_skills:\s*\[)([^\]]*)(\])/gm, (_all, prefix, body, suffix) => {
    const values = body.split(",").map((item) => item.trim()).filter(Boolean);
    const output = [];
    for (let value of values) {
      value = RELATED_REPLACEMENTS[value] ?? value;
      value = DIRECT_REPLACEMENTS[value] ?? value;
      if (!output.includes(value)) output.push(value);
    }
    return `${prefix}${output.join(", ")}${suffix}`;
  });
  for (const [oldName, newName] of Object.entries(DIRECT_REPLACEMENTS)) migrated = migrated.replaceAll(oldName, newName);
  for (const [oldName, newName] of Object.entries(TARGETED_REPLACEMENTS)) migrated = migrated.replaceAll(oldName, newName);
  migrated = migrated.replaceAll('skill_view("plan")', 'skill_view("ulw-plan")').replaceAll("skill_view('plan')", "skill_view('ulw-plan')");
  if (relatedTokens.has("plan") || explicitPlanView) migrated = migrated.replaceAll("`plan`", "`ulw-plan`").replaceAll("**plan**", "**ulw-plan**");
  return migrated;
}

export async function markdownFiles(root) {
  const output = [];
  async function walk(current) {
    const entries = await readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.name === ".ulw" || entry.name.startsWith(".ulw-stage-") || entry.name.startsWith(".ulw-backup-")) continue;
      const path = join(current, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && entry.name.endsWith(".md")) output.push(path);
    }
  }
  await walk(root);
  return output;
}

export async function explicitLegacyReferences(root) {
  const findings = [];
  for (const path of await markdownFiles(root)) {
    const text = await readFile(path, "utf8");
    for (const name of Object.keys(DIRECT_REPLACEMENTS)) if (text.includes(name)) findings.push(`${path}: ${name}`);
    for (const pattern of ["`brainstorming`", "**brainstorming**", 'skill_view("brainstorming")', "skill_view('brainstorming')"]) if (text.includes(pattern)) findings.push(`${path}: explicit brainstorming skill reference`);
    for (const pattern of ['skill_view("plan")', "skill_view('plan')"]) if (text.includes(pattern)) findings.push(`${path}: explicit plan skill invocation`);
    for (const match of text.matchAll(/^\s*related_skills:\s*\[([^\]]*)\]/gm)) {
      const tokens = new Set(match[1].split(",").map((item) => item.trim()));
      for (const name of ["brainstorming", "plan"]) if (tokens.has(name)) findings.push(`${path}: related_skills contains ${name}`);
    }
  }
  return findings;
}
