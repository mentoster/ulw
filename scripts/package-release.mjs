#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const REQUIRED_SKILLS = ["ulw-plan", "ulw-execute", "ulw-review", "ulw-worktree", "ulw-finish"];
const ALLOWED_PREFIXES = ["package/cli/", "package/evals/", "package/assets/", "package/tools/", ...REQUIRED_SKILLS.map((skill) => `package/${skill}/`)];
const ALLOWED_FILES = new Set(["package/package.json", "package/README.md", "package/EVALUATION.md", "package/CHANGELOG.md", "package/LICENSE.md", "package/THIRD_PARTY_NOTICES.md", "package/RELEASE.md"]);
const FORBIDDEN = [/(^|\/)\.env(?:\.|$)/i, /\.pem$/i, /id_rsa/i, /private[-_]?key/i, /(^|\/)test\//, /(^|\/)\.github\//, /(^|\/)node_modules\//];

function run(command, args, { cwd = process.cwd(), env = process.env, capture = true } = {}) {
  const result = spawnSync(command, args, { cwd, env, encoding: "utf8", stdio: capture ? "pipe" : "inherit" });
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`${command} ${args.join(" ")} failed${detail ? `\n${detail}` : ""}`);
  }
  return result.stdout?.trim() ?? "";
}

function runGate(command, args, { cwd = process.cwd(), env = process.env } = {}) {
  const result = spawnSync(command, args, { cwd, env, encoding: "utf8", stdio: "pipe" });
  if (result.stdout) process.stderr.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed`);
  return result.stdout?.trim() ?? "";
}

export function assertReleasePreflight({ status, tag, version }) {
  if (status.trim()) throw new Error("release packaging requires a clean Git worktree");
  const expected = `v${version}`;
  if (tag.trim() !== expected) throw new Error(`release tag mismatch: expected ${expected}, got ${tag.trim() || "<none>"}`);
  return expected;
}

export function validatePackFiles(files) {
  const names = files.map((item) => typeof item === "string" ? item : item.path).map((path) => path.startsWith("package/") ? path : `package/${path}`);
  const errors = [];
  for (const path of names) {
    if (FORBIDDEN.some((pattern) => pattern.test(path))) errors.push(`forbidden packaged path: ${path}`);
    if (!ALLOWED_FILES.has(path) && !ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix))) errors.push(`unexpected packaged path: ${path}`);
  }
  for (const skill of REQUIRED_SKILLS) if (!names.includes(`package/${skill}/SKILL.md`)) errors.push(`missing packaged skill: ${skill}/SKILL.md`);
  for (const skill of REQUIRED_SKILLS) if (!names.includes(`package/${skill}/assets/icon.svg`)) errors.push(`missing packaged skill icon: ${skill}/assets/icon.svg`);
  if (!names.includes("package/cli/bin/ulw.mjs")) errors.push("missing packaged ulw bin");
  if (!names.includes("package/evals/routing/cases.jsonl")) errors.push("missing packaged routing corpus");
  if (!names.includes("package/evals/benchmarks/publication-summary.json")) errors.push("missing packaged evaluation summary");
  if (!names.includes("package/assets/ulw-mark.svg")) errors.push("missing packaged ULW mark");
  if (!names.includes("package/assets/evaluation-current.svg")) errors.push("missing packaged deterministic evaluation chart");
  if (!names.includes("package/assets/qwen-before-after.svg")) errors.push("missing packaged Qwen evaluation chart");
  if (!names.includes("package/tools/skills-ref-version.txt")) errors.push("missing packaged skills-ref revision");
  if (errors.length) throw new Error(errors.join("\n"));
  return names;
}

export function normalizePackMetadata(value) {
  if (Array.isArray(value)) {
    if (value.length !== 1 || !value[0]?.files || !value[0]?.filename) throw new Error("npm pack JSON must contain exactly one package result");
    return value[0];
  }
  if (value?.files && value?.filename) return value;
  if (value && typeof value === "object") {
    const entries = Object.values(value);
    if (entries.length === 1 && entries[0]?.files && entries[0]?.filename) return entries[0];
  }
  throw new Error("npm pack returned an unsupported JSON shape");
}

export async function sha256File(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function cleanPrefixSmoke(tarball, version) {
  const root = await mkdtemp(join(tmpdir(), "ulw-release-smoke-"));
  const prefix = join(root, "prefix");
  const skillsRoot = join(root, "skills");
  try {
    run("npm", ["install", "--prefix", prefix, tarball, "--silent"]);
    const bin = join(prefix, "node_modules", ".bin", process.platform === "win32" ? "ulw.cmd" : "ulw");
    const actualVersion = run(bin, ["--version"]);
    if (actualVersion !== version) throw new Error(`installed bin version mismatch: ${actualVersion}`);
    run(bin, ["skill", "install", "--skills-root", skillsRoot, "--json"]);
    run(bin, ["skill", "check", "--skills-root", skillsRoot, "--json"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

export async function packageRelease({ cwd = process.cwd(), outputDir = "dist" } = {}) {
  const packageJson = JSON.parse(await readFile(join(cwd, "package.json"), "utf8"));
  if (packageJson?.bin?.ulw !== "cli/bin/ulw.mjs") throw new Error("package bin.ulw must point to cli/bin/ulw.mjs");
  assertReleasePreflight({
    status: run("git", ["status", "--porcelain"], { cwd }),
    tag: run("git", ["describe", "--tags", "--exact-match", "HEAD"], { cwd }),
    version: packageJson.version,
  });
  runGate("npm", ["run", "check"], { cwd });
  runGate("npm", ["run", "eval:fixture"], { cwd });
  if (run("git", ["status", "--porcelain"], { cwd }).trim()) throw new Error("verification changed tracked release inputs");

  const dry = normalizePackMetadata(JSON.parse(run("npm", ["pack", "--json", "--dry-run"], { cwd })));
  validatePackFiles(dry.files);
  const absoluteOutput = resolve(cwd, outputDir);
  await rm(absoluteOutput, { recursive: true, force: true });
  await mkdir(absoluteOutput, { recursive: true });
  const packed = normalizePackMetadata(JSON.parse(run("npm", ["pack", "--json", "--pack-destination", absoluteOutput], { cwd })));
  validatePackFiles(packed.files);
  const tarball = join(absoluteOutput, packed.filename);
  const checksum = await sha256File(tarball);
  await writeFile(join(absoluteOutput, "SHA256SUMS"), `${checksum}  ${basename(tarball)}\n`);
  const metricJson = run(process.execPath, ["cli/bin/ulw.mjs", "eval", "score", "--results", ".hermes/evidence/routing-fixture-results.jsonl", "--json"], { cwd });
  const metrics = JSON.parse(metricJson);
  if (!metrics.passed) throw new Error(`routing metric gate failed: ${metrics.violations.join("; ")}`);
  await writeFile(join(absoluteOutput, "routing-metrics.json"), `${JSON.stringify(metrics, null, 2)}\n`);
  await cleanPrefixSmoke(tarball, packageJson.version);
  if (await sha256File(tarball) !== checksum) throw new Error("tarball changed after checksum generation");
  return { version: packageJson.version, tag: `v${packageJson.version}`, tarball, checksum, metrics: join(absoluteOutput, "routing-metrics.json") };
}

async function main() {
  const result = await packageRelease();
  process.stdout.write(`${JSON.stringify({ ok: true, ...result }, null, 2)}\n`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`release packaging failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
