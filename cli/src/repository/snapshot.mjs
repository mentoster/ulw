import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readdir, readFile } from "node:fs/promises";
import { basename, join, relative } from "node:path";

const execFileAsync = promisify(execFile);
const INSTRUCTION_NAMES = new Set(["AGENTS.md", "CLAUDE.md"]);
const MANIFEST_NAMES = new Set([
  "package.json", "pyproject.toml", "Cargo.toml", "go.mod", "Makefile", "CMakeLists.txt",
  "pubspec.yaml", "build.gradle", "build.gradle.kts", "pom.xml",
]);
const LOCKFILE_NAMES = new Set(["package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lock", "bun.lockb", "Cargo.lock", "poetry.lock"]);
const SECRET_BASENAME = /(token|secret|credential|password|cookie|auth)/i;
const SECRET_EXTENSION = /\.(pem|key|p12|pfx|crt|cer)$/i;

export function isSecretLikePath(path) {
  const name = basename(path);
  return name === ".env" || name.startsWith(".env.") || SECRET_BASENAME.test(name) || SECRET_EXTENSION.test(name);
}

async function walkAllowed(root, current = root, depth = 0, output = []) {
  if (depth > 5) return output;
  const entries = await readdir(current, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if ([".git", ".hermes", ".ulw", ".agents", "node_modules", "build", "dist", ".cache"].includes(entry.name)) continue;
    const absolute = join(current, entry.name);
    const rel = relative(root, absolute);
    if (isSecretLikePath(rel)) continue;
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (entry.name === ".github" || depth < 3) await walkAllowed(root, absolute, depth + 1, output);
      continue;
    }
    if (INSTRUCTION_NAMES.has(entry.name) || MANIFEST_NAMES.has(entry.name) || LOCKFILE_NAMES.has(entry.name) || rel.startsWith(`.github/workflows/`)) output.push(rel);
  }
  return output;
}

async function git(workspace, args) {
  try {
    const { stdout } = await execFileAsync("git", ["-C", workspace, ...args], { encoding: "utf8", maxBuffer: 1024 * 1024 });
    return stdout.trimEnd();
  } catch {
    return null;
  }
}

async function readPackageMetadata(workspace, paths) {
  const packages = [];
  for (const path of paths.filter((item) => basename(item) === "package.json")) {
    try {
      const parsed = JSON.parse(await readFile(join(workspace, path), "utf8"));
      packages.push({ path, name: parsed.name ?? null, scripts: parsed.scripts ?? {} });
    } catch {
      packages.push({ path, name: null, scripts: {}, invalid: true });
    }
  }
  return packages;
}

export async function createRepositorySnapshot(workspace, now = new Date().toISOString()) {
  const discovered = (await walkAllowed(workspace)).sort();
  const head = await git(workspace, ["rev-parse", "HEAD"]);
  const branch = await git(workspace, ["branch", "--show-current"]);
  const status = await git(workspace, ["status", "--short"]);
  return {
    workspaceRoot: workspace,
    git: head ? { head, branch: branch || null, status: status ? status.split("\n") : [] } : null,
    instructions: discovered.filter((path) => INSTRUCTION_NAMES.has(basename(path))),
    manifests: discovered.filter((path) => MANIFEST_NAMES.has(basename(path))),
    lockfiles: discovered.filter((path) => LOCKFILE_NAMES.has(basename(path))),
    workflows: discovered.filter((path) => path.startsWith(".github/workflows/")),
    packages: await readPackageMetadata(workspace, discovered),
    capturedAt: now,
  };
}
