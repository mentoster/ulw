import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access, lstat, readFile, readdir } from "node:fs/promises";
import { constants, statSync } from "node:fs";
import { delimiter, join } from "node:path";
import { CURRENT_STATE_SCHEMA_VERSION, validateState } from "../state/schema.mjs";
import { checkGeneratedDrift } from "../plan/generated-drift.mjs";
import { checkLegacyCleanliness, checkSkillsRoot } from "../skills/check.mjs";
import { readInstallManifest, readIntent, transactionRecords } from "../skills/transaction-store.mjs";
import { CLI_VERSION } from "../command-registry.mjs";
import { compareVersions } from "../skills/version.mjs";

const execFileAsync = promisify(execFile);
function finding(code, severity, message, remediation = null) { return { code, severity, message, remediation }; }

async function commandVersion(command, args = ["--version"]) {
  try { return (await execFileAsync(command, args, { encoding: "utf8" })).stdout.trim(); }
  catch { return null; }
}

function resolveBin(name, pathValue = process.env.PATH ?? "") {
  const suffixes = process.platform === "win32" ? [".cmd", ".exe", ""] : [""];
  for (const dir of pathValue.split(delimiter).filter(Boolean)) for (const suffix of suffixes) {
    const candidate = join(dir, `${name}${suffix}`);
    try { if (requireStat(candidate)) return candidate; } catch {}
  }
  return null;
}
function requireStat(path) {
  return statSync(path).isFile();
}

export async function runDoctor({ runtimeContext = null, workspace = null, skillsRoot = null, pathValue = process.env.PATH ?? "", binName = "ulw" }) {
  const context = runtimeContext ?? {
    workspace,
    skillsRoot,
    artifactRoot: join(workspace, ".hermes"),
    profile: "legacy",
  };
  workspace = context.workspace;
  skillsRoot = context.skillsRoot;
  const findings = [];
  findings.push(finding("DOCTOR_PROFILE", "ok", `profile ${context.profile}; artifact root ${context.artifactRoot}; skills root ${context.skillsRoot}`));
  const major = Number(process.versions.node.split(".")[0]);
  if (major < 20) findings.push(finding("DOCTOR_NODE_VERSION", "error", `Node ${process.versions.node} is unsupported`, "Install Node 20 or newer."));
  else findings.push(finding("DOCTOR_NODE_VERSION", "ok", `Node ${process.versions.node}`));
  const npmVersion = await commandVersion("npm");
  findings.push(npmVersion ? finding("DOCTOR_NPM", "ok", `npm ${npmVersion}`) : finding("DOCTOR_NPM", "error", "npm is not available", "Install npm for local package/link workflows."));
  const bin = resolveBin(binName, pathValue);
  findings.push(bin ? finding("DOCTOR_BIN", "ok", `${binName} resolves to ${bin}`) : finding("DOCTOR_BIN", "warning", `${binName} is not on PATH`, "Run `npm link` from the project or invoke `node cli/bin/ulw.mjs`."));
  let packageJson;
  try { packageJson = JSON.parse(await readFile(join(workspace, "package.json"), "utf8")); }
  catch { packageJson = null; }
  const isUlwSourceCheckout = packageJson?.name === "ulw-cli" || await lstat(join(workspace, "cli", "bin", "ulw.mjs")).catch(() => null);
  if (!isUlwSourceCheckout) {
    findings.push(finding("DOCTOR_PACKAGE", "ok", packageJson?.name
      ? `consumer project package ${packageJson.name}; ULW package metadata is not required`
      : "consumer workspace without package.json; ULW package metadata is not required"));
  } else if (packageJson?.name === "ulw-cli" && packageJson?.bin?.ulw && packageJson?.version === CLI_VERSION) {
    findings.push(finding("DOCTOR_PACKAGE", "ok", `project package metadata matches CLI ${CLI_VERSION}`));
  } else {
    findings.push(finding("DOCTOR_PACKAGE", "error", "ULW source checkout package metadata is missing or invalid"));
  }
  const artifactPath = context.artifactRoot;
  const artifactStat = await lstat(artifactPath).catch(() => null);
  if (artifactStat?.isSymbolicLink()) findings.push(finding("DOCTOR_ARTIFACT_PATH", "error", "artifact root is a symlink", "Replace it with a real project-local directory."));
  else {
    const writableTarget = artifactStat ? artifactPath : workspace;
    try { await access(writableTarget, constants.W_OK); findings.push(finding("DOCTOR_ARTIFACT_PATH", "ok", "artifact target is writable and non-symlinked")); }
    catch { findings.push(finding("DOCTOR_ARTIFACT_PATH", "error", "artifact target is not writable")); }
  }
  const stateRoot = join(context.artifactRoot, "ulw");
  for (const entry of await readdir(stateRoot, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const statePath = join(stateRoot, entry.name, "state.json");
    if (!await lstat(statePath).catch(() => null)) continue;
    try {
      const state = JSON.parse(await readFile(statePath, "utf8"));
      const errors = validateState(state);
      if (errors.length) findings.push(finding("DOCTOR_STATE_INVALID", "error", `${entry.name}: ${errors.map((item) => item.code).join(", ")}`));
      else {
        if (state.schemaVersion < CURRENT_STATE_SCHEMA_VERSION) findings.push(finding("DOCTOR_STATE_MIGRATION_REQUIRED", "warning", `${entry.name}: schemaVersion ${state.schemaVersion} is read-only`, `Run \`ulw plan migrate ${entry.name} --dry-run\` and confirm with --yes.`));
        for (const drift of await checkGeneratedDrift(context, state)) findings.push(finding(`DOCTOR_${drift.code}`, "warning", `${entry.name}: ${drift.message}`, "Run `ulw plan render <slug>`."));
      }
    } catch { findings.push(finding("DOCTOR_STATE_CORRUPT", "error", `${entry.name}: cannot read state JSON`)); }
  }
  const skillErrors = await checkSkillsRoot(skillsRoot);
  if (skillErrors.length) findings.push(finding("DOCTOR_SKILLS", "error", "runtime ULW skill state is invalid", skillErrors.join("; ")));
  const legacy = await checkLegacyCleanliness(skillsRoot);
  if (legacy.length) findings.push(finding("DOCTOR_LEGACY_MIGRATION_AVAILABLE", "warning", "legacy skill content is present", "Run `ulw skill migrate-legacy --dry-run` and review the exact action plan before confirming with `--yes`."));
  try {
    const manifest = await readInstallManifest(skillsRoot);
    const intent = await readIntent(skillsRoot);
    const generations = await transactionRecords(skillsRoot);
    if (intent) findings.push(finding("DOCTOR_SKILL_TRANSACTION_INTERRUPTED", "error", `interrupted skill transaction ${intent.transactionId ?? "unknown"}`, "Inspect the transaction and restore it before another installer mutation."));
    else if (manifest) {
      findings.push(finding("DOCTOR_SKILLS", "ok", manifest.status === "installed" ? "runtime ULW skill family passes checks" : "ULW skills are intentionally uninstalled and tombstoned"));
      findings.push(finding("DOCTOR_SKILL_MANIFEST", "ok", `skill manifest ${manifest.status} at ${manifest.packageVersion}; ${generations.length} recoverable generation(s)`));
      const comparison = compareVersions(CLI_VERSION, manifest.packageVersion);
      if (manifest.status === "installed" && comparison > 0) findings.push(finding("DOCTOR_SKILL_UPDATE_AVAILABLE", "warning", `running package ${CLI_VERSION} is newer than installed skills ${manifest.packageVersion}`, "Run `ulw skill update --dry-run`, then apply the verified bundle."));
      else if (manifest.status === "installed" && comparison < 0) findings.push(finding("DOCTOR_SKILL_PACKAGE_OLDER", "warning", `running package ${CLI_VERSION} is older than installed skills ${manifest.packageVersion}`, "Use the matching/newer verified package; downgrade requires --allow-downgrade."));
    }
    else findings.push(finding("DOCTOR_SKILL_MANIFEST", "warning", "skill manifest is absent", "Run `ulw skill install` to establish ownership and rollback metadata."));
  } catch (error) {
    findings.push(finding("DOCTOR_SKILL_MANIFEST", "error", error instanceof Error ? error.message : String(error)));
  }
  const legacyPython = [join(workspace, "tools", "deploy.py"), join(workspace, "ulw-plan", "scripts", "scaffold_plan.py")];
  if ((await Promise.all(legacyPython.map((path) => lstat(path).catch(() => null)))).some(Boolean)) findings.push(finding("DOCTOR_PYTHON_MIGRATION", "warning", "legacy Python tooling is still present", "Complete Node parity before deleting it."));
  else findings.push(finding("DOCTOR_PYTHON_MIGRATION", "ok", "legacy Python tooling is absent"));
  return { ok: !findings.some((item) => item.severity === "error"), findings };
}
