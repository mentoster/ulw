import { lstat, mkdir, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { CliError } from "../errors.mjs";

export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,79}$/;

export function assertSlug(slug) {
  if (!SLUG_PATTERN.test(slug)) {
    throw new CliError(`invalid slug: ${slug}`, {
      code: "STATE_INVALID_SLUG",
      details: ["Use lowercase letters, digits, and hyphens; maximum length is 80."],
    });
  }
}

export async function resolveWorkspace(input = process.cwd()) {
  const resolved = resolve(input);
  try {
    return await realpath(resolved);
  } catch {
    throw new CliError(`workspace does not exist: ${resolved}`, { code: "WORKSPACE_NOT_FOUND" });
  }
}

export function assertContained(parent, child, code = "PATH_ESCAPE") {
  const rel = relative(parent, child);
  if (rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel))) return;
  throw new CliError(`path escapes allowed root: ${child}`, { code });
}

export function resolveContained(parent, relativePath, code = "PATH_ESCAPE") {
  const target = resolve(parent, relativePath);
  assertContained(parent, target, code);
  return target;
}

export async function assertNoSymlinkComponents(root, target) {
  assertContained(root, target);
  const parts = relative(root, target).split(sep).filter(Boolean);
  let current = root;
  for (const part of parts) {
    current = resolve(current, part);
    const stat = await lstat(current).catch((error) => {
      if (error?.code === "ENOENT") return null;
      throw error;
    });
    if (stat?.isSymbolicLink()) {
      throw new CliError(`symlink path component is not allowed: ${current}`, { code: "PATH_SYMLINK" });
    }
  }
}

export async function ensureSafeDirectory(workspace, target) {
  await assertNoSymlinkComponents(workspace, target);
  await mkdir(target, { recursive: true });
  await assertNoSymlinkComponents(workspace, target);
}

const ALLOWED_ARTIFACT_PREFIXES = ["ulw", "drafts", "plans", "evidence"];

function runtimeRoots(workspaceOrContext) {
  if (typeof workspaceOrContext === "string") {
    return { workspace: workspaceOrContext, artifactRoot: resolveContained(workspaceOrContext, ".hermes") };
  }
  return { workspace: workspaceOrContext.workspace, artifactRoot: workspaceOrContext.artifactRoot };
}

export async function resolveArtifactTarget(workspaceOrContext, relativePath) {
  const { workspace, artifactRoot } = runtimeRoots(workspaceOrContext);
  assertContained(workspace, artifactRoot, "CONFIG_ARTIFACT_ROOT_ESCAPE");
  const target = resolveContained(artifactRoot, relativePath, "ARTIFACT_PATH_ESCAPE");
  const first = relative(artifactRoot, target).split(sep)[0];
  if (!ALLOWED_ARTIFACT_PREFIXES.includes(first)) {
    throw new CliError(`unsupported artifact-root write target: ${relativePath}`, { code: "ARTIFACT_PATH_NOT_ALLOWED" });
  }
  await assertNoSymlinkComponents(workspace, target);
  return target;
}
