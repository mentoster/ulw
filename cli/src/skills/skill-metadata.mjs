import { CliError } from "../errors.mjs";

const ALLOWED_TOP_LEVEL = new Set([
  "name",
  "description",
  "license",
  "compatibility",
  "metadata",
  "allowed-tools",
]);

function scalar(raw) {
  const value = raw.trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

export function parseSkillMetadata(text, { path = "SKILL.md" } = {}) {
  const normalized = text.replaceAll("\r\n", "\n");
  if (!normalized.startsWith("---\n")) {
    throw new CliError(`missing frontmatter: ${path}`, { code: "SKILL_FRONTMATTER_MISSING" });
  }
  const end = normalized.indexOf("\n---\n", 4);
  if (end < 0) throw new CliError(`unterminated frontmatter: ${path}`, { code: "SKILL_FRONTMATTER_INVALID" });
  const lines = normalized.slice(4, end).split("\n");
  const result = { metadata: {} };
  let section = null;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const indent = line.match(/^\s*/)[0].length;
    if (indent === 0) {
      const match = line.match(/^([a-zA-Z0-9-]+):(?:\s*(.*))?$/);
      if (!match) throw new CliError(`invalid frontmatter line ${index + 2}: ${path}`, { code: "SKILL_FRONTMATTER_INVALID" });
      const [, key, raw = ""] = match;
      if (!ALLOWED_TOP_LEVEL.has(key)) {
        throw new CliError(`unsupported frontmatter field: ${key}`, {
          code: "SKILL_FRONTMATTER_UNSUPPORTED",
          details: [path],
        });
      }
      section = key === "metadata" ? "metadata" : null;
      if (key !== "metadata") result[key] = scalar(raw);
      else if (raw.trim()) throw new CliError(`metadata must be a mapping: ${path}`, { code: "SKILL_METADATA_INVALID" });
      continue;
    }
    if (section !== "metadata" || indent !== 2) {
      throw new CliError(`nested frontmatter is not supported: ${path}`, { code: "SKILL_METADATA_NESTED" });
    }
    const match = line.match(/^\s{2}([a-zA-Z0-9_-]+):\s*(.*)$/);
    if (!match) throw new CliError(`invalid metadata entry: ${path}`, { code: "SKILL_METADATA_INVALID" });
    const [, key, raw] = match;
    const value = scalar(raw);
    if (!value || value.startsWith("[") || value.startsWith("{") || value === "|" || value === ">") {
      throw new CliError(`metadata values must be non-empty strings: ${key}`, {
        code: "SKILL_METADATA_NON_SCALAR",
        details: [path],
      });
    }
    result.metadata[key] = value;
  }
  return result;
}

export function validateSkillMetadata(metadata, { expectedName, cliVersion } = {}) {
  const errors = [];
  if (!metadata.name) errors.push("missing name");
  if (expectedName && metadata.name !== expectedName) errors.push(`expected name ${expectedName}, got ${metadata.name ?? "<missing>"}`);
  if (!metadata.description) errors.push("missing description");
  else {
    if (metadata.description.length > 1024) errors.push("description exceeds 1024 characters");
    if (!/\bUse when\b/i.test(metadata.description)) errors.push("description must include a concrete Use when trigger");
    if (!/\bDo not use\b/i.test(metadata.description)) errors.push("description must include a neighboring Do not use boundary");
  }
  if (!metadata.license) errors.push("missing license");
  if (!metadata.compatibility) errors.push("missing compatibility");
  for (const key of ["author", "version", "ulw_cli_version", "tags", "related_skills"]) {
    if (typeof metadata.metadata?.[key] !== "string" || !metadata.metadata[key]) errors.push(`metadata.${key} must be a string`);
  }
  if (cliVersion && metadata.metadata?.ulw_cli_version !== cliVersion) {
    errors.push(`metadata.ulw_cli_version must equal ${cliVersion}`);
  }
  return errors;
}

export function readSkillMetadata(text, options = {}) {
  const parsed = parseSkillMetadata(text, options);
  const errors = validateSkillMetadata(parsed, options);
  if (errors.length) {
    throw new CliError(`invalid skill metadata: ${options.path ?? "SKILL.md"}`, {
      code: "SKILL_METADATA_INVALID",
      details: errors,
    });
  }
  return parsed;
}
