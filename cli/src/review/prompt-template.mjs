import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { packageRoot } from "../skills/constants.mjs";

const ROLE_FILES = {
  "plan-critic": "plan-critic-prompt.md",
  "architecture-verifier": "architecture-verifier-prompt.md",
};

export async function loadPromptTemplate(role) {
  const filename = ROLE_FILES[role];
  if (!filename) throw new Error(`unknown review role: ${role}`);
  return readFile(join(packageRoot, "ulw-plan", "references", filename), "utf8");
}

export async function renderPrompt(role, values) {
  let content = await loadPromptTemplate(role);
  for (const [key, value] of Object.entries(values)) content = content.replaceAll(`{{${key}}}`, String(value));
  const unresolved = [...content.matchAll(/\{\{([A-Z0-9_]+)\}\}/g)].map((match) => match[1]);
  if (unresolved.length > 0) throw new Error(`unresolved prompt placeholders: ${unresolved.join(", ")}`);
  return content;
}
