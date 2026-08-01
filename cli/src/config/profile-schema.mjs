import { CliError } from "../errors.mjs";

const ALLOWED_KEYS = new Set(["schemaVersion", "profile", "artifactRoot", "skillsRoot", "handoffTemplate", "reviewCapability"]);

export function validateProfileConfig(value, { path = "config" } = {}) {
  const errors = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) return [`${path} must be an object`];
  for (const key of Object.keys(value)) if (!ALLOWED_KEYS.has(key)) errors.push(`${path}.${key} is not supported`);
  if (value.schemaVersion !== undefined && value.schemaVersion !== 1) errors.push(`${path}.schemaVersion must be 1`);
  if (value.profile !== undefined && (typeof value.profile !== "string" || !value.profile)) errors.push(`${path}.profile must be a non-empty string`);
  for (const key of ["artifactRoot", "skillsRoot", "handoffTemplate", "reviewCapability"]) {
    if (value[key] !== undefined && (typeof value[key] !== "string" || !value[key])) errors.push(`${path}.${key} must be a non-empty string`);
  }
  if (value.handoffTemplate !== undefined && !value.handoffTemplate.includes("{planPath}")) errors.push(`${path}.handoffTemplate must include {planPath}`);
  return errors;
}

export function assertProfileConfig(value, options = {}) {
  const errors = validateProfileConfig(value, options);
  if (errors.length) throw new CliError("ULW profile configuration is invalid", { code: "CONFIG_INVALID", details: errors });
  return value;
}
