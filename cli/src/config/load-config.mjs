import { readFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { CliError } from "../errors.mjs";
import { assertProfileConfig } from "./profile-schema.mjs";

async function readJson(path, { optional = false } = {}) {
  let raw;
  try { raw = await readFile(path, "utf8"); }
  catch (error) {
    if (optional && error?.code === "ENOENT") return null;
    if (error?.code === "ENOENT") throw new CliError(`configuration file does not exist: ${path}`, { code: "CONFIG_NOT_FOUND" });
    throw error;
  }
  try { return JSON.parse(raw); }
  catch { throw new CliError(`configuration JSON is invalid: ${path}`, { code: "CONFIG_JSON_INVALID" }); }
}

export function projectConfigPath(workspace) {
  return join(workspace, ".ulw", "config.json");
}

export async function loadConfig(workspace, explicitPath = null) {
  const path = explicitPath ? (isAbsolute(explicitPath) ? explicitPath : resolve(workspace, explicitPath)) : projectConfigPath(workspace);
  const config = await readJson(path, { optional: !explicitPath });
  if (config === null) return { path, config: {} };
  assertProfileConfig(config, { path });
  return { path, config };
}
