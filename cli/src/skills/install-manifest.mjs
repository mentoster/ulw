import { createHash } from "node:crypto";

export const INSTALL_MANIFEST_SCHEMA_VERSION = 1;
export const TRANSACTION_RETENTION = 5;

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}

export function manifestDigest(manifest) {
  if (!manifest) return null;
  return createHash("sha256").update(JSON.stringify(canonical(manifest))).digest("hex");
}

export function validateInstallManifest(manifest) {
  const errors = [];
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) return ["manifest must be an object"];
  if (manifest.schemaVersion !== INSTALL_MANIFEST_SCHEMA_VERSION) errors.push(`schemaVersion must be ${INSTALL_MANIFEST_SCHEMA_VERSION}`);
  if (!new Set(["installed", "uninstalled"]).has(manifest.status)) errors.push("status must be installed or uninstalled");
  for (const key of ["cliVersion", "packageVersion", "operation", "transactionId", "updatedAt"]) {
    if (typeof manifest[key] !== "string" || !manifest[key]) errors.push(`${key} must be a string`);
  }
  if (manifest.previousManifestDigest !== null && typeof manifest.previousManifestDigest !== "string") errors.push("previousManifestDigest must be null or string");
  if (!manifest.skills || typeof manifest.skills !== "object" || Array.isArray(manifest.skills)) errors.push("skills must be an object");
  else for (const [name, record] of Object.entries(manifest.skills)) {
    if (!record || typeof record !== "object") errors.push(`skills.${name} must be an object`);
    else for (const key of ["path", "checksum", "sourceChecksum"]) if (typeof record[key] !== "string" || !record[key]) errors.push(`skills.${name}.${key} must be a string`);
  }
  return errors;
}

export function buildInstallManifest({ cliVersion, packageVersion, operation, transactionId, previousManifest = null, skills, status = "installed", now = new Date().toISOString() }) {
  return {
    schemaVersion: INSTALL_MANIFEST_SCHEMA_VERSION,
    status,
    cliVersion,
    packageVersion,
    operation,
    transactionId,
    updatedAt: now,
    previousManifestDigest: manifestDigest(previousManifest),
    skills,
  };
}
