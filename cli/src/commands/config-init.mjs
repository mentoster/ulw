import { lstat } from "node:fs/promises";
import { parseOptions } from "../args.mjs";
import { CliError } from "../errors.mjs";
import { atomicWriteJson } from "../io/atomic-write.mjs";
import { projectConfigPath } from "../config/load-config.mjs";
import { contextSummary } from "../config/runtime-context.mjs";
import { output } from "./command-io.mjs";

async function handler(argv, io, runtimeContext) {
  const { options } = parseOptions(argv, { force: "boolean", json: "boolean" });
  const path = projectConfigPath(runtimeContext.workspace);
  if (!options.force && await lstat(path).catch(() => null)) throw new CliError(`configuration already exists: ${path}`, { code: "CONFIG_EXISTS" });
  const config = {
    schemaVersion: 1,
    profile: runtimeContext.profile,
    artifactRoot: runtimeContext.artifactRootSetting,
    skillsRoot: runtimeContext.skillsRootSetting,
    handoffTemplate: runtimeContext.handoffTemplate,
    reviewCapability: runtimeContext.reviewCapability,
  };
  await atomicWriteJson(path, config);
  output(io, { ok: true, path, config, resolved: contextSummary(runtimeContext) }, options.json);
  return 0;
}
export function register(registerCommand) { registerCommand("config", "init", handler); }
