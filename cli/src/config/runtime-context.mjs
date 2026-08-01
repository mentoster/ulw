import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { CliError } from "../errors.mjs";
import { assertContained, assertNoSymlinkComponents, resolveWorkspace } from "../io/path-policy.mjs";
import { builtinProfile } from "./builtin-profiles.mjs";
import { loadConfig } from "./load-config.mjs";

function expandHome(value) {
  if (value === "~") return homedir();
  if (value.startsWith(`~${sep}`) || value.startsWith("~/")) return join(homedir(), value.slice(2));
  return value;
}

function resolveArtifactRoot(workspace, value) {
  const path = isAbsolute(value) ? resolve(value) : resolve(workspace, value);
  assertContained(workspace, path, "CONFIG_ARTIFACT_ROOT_ESCAPE");
  return path;
}

function resolveSkillsRoot(workspace, value) {
  const expanded = expandHome(value);
  return isAbsolute(expanded) ? resolve(expanded) : resolve(workspace, expanded);
}

function slash(value) { return value.split(sep).join("/"); }

export function artifactPath(runtimeContext, ...parts) {
  return join(runtimeContext.artifactRoot, ...parts);
}

export function displayPath(runtimeContext, absolute) {
  const rel = relative(runtimeContext.workspace, absolute);
  return rel && !rel.startsWith(`..${sep}`) && rel !== ".." ? slash(rel) : slash(absolute);
}

export function displayArtifactPath(runtimeContext, ...parts) {
  return displayPath(runtimeContext, artifactPath(runtimeContext, ...parts));
}

export function renderHandoff(runtimeContext, slug) {
  return runtimeContext.handoffTemplate.replaceAll("{planPath}", displayArtifactPath(runtimeContext, "plans", `${slug}.md`));
}

export async function resolveRuntimeContext(options = {}) {
  const workspace = await resolveWorkspace(options.workspace);
  const loaded = await loadConfig(workspace, options.config);
  const profileName = options.profile ?? loaded.config.profile ?? "legacy";
  const base = builtinProfile(profileName);
  if (!base) throw new CliError(`unknown ULW profile: ${profileName}`, { code: "CONFIG_PROFILE_UNKNOWN" });
  const merged = {
    ...base,
    ...Object.fromEntries(Object.entries(loaded.config).filter(([key, value]) => !["schemaVersion", "profile"].includes(key) && value !== undefined)),
  };
  if (options.artifactRoot) merged.artifactRoot = options.artifactRoot;
  if (options.skillsRoot) merged.skillsRoot = options.skillsRoot;
  const artifactRoot = resolveArtifactRoot(workspace, merged.artifactRoot);
  const skillsRoot = resolveSkillsRoot(workspace, merged.skillsRoot);
  await assertNoSymlinkComponents(workspace, artifactRoot);
  const context = {
    workspace,
    profile: profileName,
    configPath: loaded.path,
    artifactRoot,
    skillsRoot,
    artifactRootSetting: merged.artifactRoot,
    skillsRootSetting: merged.skillsRoot,
    handoffTemplate: merged.handoffTemplate,
    reviewCapability: merged.reviewCapability,
  };
  return Object.freeze(context);
}

export function contextSummary(runtimeContext) {
  return {
    profile: runtimeContext.profile,
    workspace: runtimeContext.workspace,
    configPath: runtimeContext.configPath,
    artifactRoot: runtimeContext.artifactRoot,
    skillsRoot: runtimeContext.skillsRoot,
    handoffTemplate: runtimeContext.handoffTemplate,
    reviewCapability: runtimeContext.reviewCapability,
  };
}
