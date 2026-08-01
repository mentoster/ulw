import { cp, lstat, mkdir, rename, rm } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { CLI_VERSION } from "../command-registry.mjs";
import { CliError } from "../errors.mjs";
import { checkSkillsRoot, checkSkillDirectory } from "./check.mjs";
import { mutationActions, planSkillActions, summarizeActions } from "./action-plan.mjs";
import { buildInstallManifest, manifestDigest } from "./install-manifest.mjs";
import { hashFile, hashTree } from "./tree-hash.mjs";
import {
  abandonTransaction,
  beginTransaction,
  commitTransaction,
  readInstallManifest,
  readIntent,
  restorePreviousManifest,
  transactionRecords,
} from "./transaction-store.mjs";
import { FAMILY } from "./constants.mjs";
import { assertSkillsPathSafe } from "./path-policy.mjs";

const PACKAGE_VERSION = CLI_VERSION;

async function exists(path) { return Boolean(await lstat(path).catch(() => null)); }

function relativeTarget(skillsRoot, target) {
  return relative(skillsRoot, target).split("\\").join("/");
}

export async function installedSkillRecords(skillsRoot) {
  const skills = {};
  for (const name of FAMILY) {
    const path = join(skillsRoot, "software-development", name);
    const checksum = await hashTree(path);
    if (checksum) skills[name] = { path: relativeTarget(skillsRoot, path), checksum, sourceChecksum: checksum };
  }
  return skills;
}

async function rollbackApplied(applied) {
  for (const item of applied.reverse()) {
    await rm(item.target, { recursive: true, force: true }).catch(() => {});
    if (item.backup && await exists(item.backup)) {
      await mkdir(dirname(item.target), { recursive: true });
      await rename(item.backup, item.target).catch(() => {});
    }
  }
}

export async function executeSkillInstall(skillsRoot, {
  dryRun = false,
  operation = "install",
  forcePostCheckFailure = false,
} = {}) {
  const root = resolve(skillsRoot);
  await assertSkillsPathSafe(root);
  await mkdir(join(root, "software-development"), { recursive: true });
  await assertSkillsPathSafe(join(root, "software-development"));
  const actions = await planSkillActions(root);
  const mutations = mutationActions(actions);
  const summary = summarizeActions(actions);
  if (dryRun) return { actions, summary, changed: mutations.map((item) => item.path), transactionId: null, manifest: await readInstallManifest(root) };
  if (mutations.length === 0) {
    const errors = await checkSkillsRoot(root);
    if (errors.length) throw new CliError("installed skill family failed validation", { code: "SKILL_INSTALL_INVALID", details: errors });
    return { actions, summary, changed: [], transactionId: null, manifest: await readInstallManifest(root) };
  }

  const transaction = await beginTransaction(root, { operation, actions: mutations });
  const applied = [];
  try {
    for (let index = 0; index < mutations.length; index += 1) {
      const action = mutations[index];
      const staged = join(transaction.stage, "software-development", action.skill);
      const backup = join(transaction.backups, "family", action.skill);
      await mkdir(dirname(staged), { recursive: true });
      await cp(action.source, staged, { recursive: true, errorOnExist: true });
      const stagedErrors = await checkSkillDirectory(staged, action.skill);
      if (stagedErrors.length) throw new CliError("staged skill failed validation", { code: "SKILL_STAGE_INVALID", details: stagedErrors });
      if (await exists(action.path)) {
        await mkdir(dirname(backup), { recursive: true });
        await rename(action.path, backup);
      }
      await mkdir(dirname(action.path), { recursive: true });
      await rename(staged, action.path);
      applied.push({ target: action.path, backup: await exists(backup) ? backup : null });
      action.backup = await exists(backup) ? relative(transaction.root, backup).split("\\").join("/") : null;
      action.target = relativeTarget(root, action.path);
    }

    const postErrors = forcePostCheckFailure ? ["forced post-copy failure"] : await checkSkillsRoot(root, { checkManifest: false });
    if (postErrors.length) throw new CliError("post-deploy validation failed", { code: "SKILL_POSTCHECK_FAILED", details: postErrors });
    const skills = {};
    for (const action of actions) {
      skills[action.skill] = {
        path: relativeTarget(root, action.path),
        checksum: await hashTree(action.path),
        sourceChecksum: action.newChecksum,
      };
    }
    const manifest = buildInstallManifest({
      cliVersion: CLI_VERSION,
      packageVersion: PACKAGE_VERSION,
      operation,
      transactionId: transaction.transactionId,
      previousManifest: transaction.previousManifest,
      skills,
    });
    const receipt = {
      schemaVersion: 1,
      status: "committed",
      transactionId: transaction.transactionId,
      operation,
      startedAt: transaction.intent.startedAt,
      committedAt: new Date().toISOString(),
      previousManifestDigest: manifestDigest(transaction.previousManifest),
      manifestDigest: manifestDigest(manifest),
      actions: mutations.map(({ source, path, ...action }) => action),
    };
    await commitTransaction(transaction, { receipt, manifest });
    return { actions, summary, changed: mutations.map((item) => item.path), transactionId: transaction.transactionId, manifest };
  } catch (error) {
    await rollbackApplied(applied);
    await abandonTransaction(transaction);
    throw error;
  }
}

async function restoreAction(skillsRoot, transactionRoot, action) {
  const target = resolve(skillsRoot, action.target);
  if (!target.startsWith(`${resolve(skillsRoot)}${process.platform === "win32" ? "\\" : "/"}`)) {
    throw new CliError(`rollback target escapes skills root: ${action.target}`, { code: "SKILL_ROLLBACK_ESCAPE" });
  }
  if (action.operation === "create") {
    await rm(target, { recursive: true, force: true });
    return;
  }
  if (action.operation === "update" || action.operation === "remove") {
    if (!action.backup) throw new CliError(`rollback backup is missing for ${action.target}`, { code: "SKILL_ROLLBACK_BACKUP_MISSING" });
    const backup = resolve(transactionRoot, action.backup);
    if (!await exists(backup)) throw new CliError(`rollback backup is missing: ${backup}`, { code: "SKILL_ROLLBACK_BACKUP_MISSING" });
    await rm(target, { recursive: true, force: true });
    await mkdir(dirname(target), { recursive: true });
    await cp(backup, target, { recursive: true, force: true });
    return;
  }
  if (action.operation === "rewrite") {
    if (!action.backup) throw new CliError(`rollback backup is missing for ${action.target}`, { code: "SKILL_ROLLBACK_BACKUP_MISSING" });
    const backup = resolve(transactionRoot, action.backup);
    await mkdir(dirname(target), { recursive: true });
    await cp(backup, target, { force: true });
  }
}

export async function rollbackLatest(skillsRoot) {
  const root = resolve(skillsRoot);
  const intent = await readIntent(root);
  if (intent) throw new CliError("cannot rollback while an interrupted transaction marker exists", { code: "SKILL_TRANSACTION_INTERRUPTED" });
  const records = await transactionRecords(root);
  const current = await readInstallManifest(root);
  const candidate = [...records].reverse().find((item) => item.transactionId === current?.transactionId) ?? records.at(-1);
  if (!candidate) throw new CliError("no successful skill transaction is available for rollback", { code: "SKILL_ROLLBACK_EMPTY" });

  for (const action of candidate.receipt.actions) {
    if (!["create", "update", "remove", "rewrite"].includes(action.operation)) continue;
    if (action.operation === "create" || action.operation === "update") {
      const target = resolve(root, action.target);
      const currentChecksum = await hashTree(target);
      if (currentChecksum !== action.newChecksum) {
        throw new CliError("installed skill bytes changed after the recorded transaction", {
          code: "SKILL_ROLLBACK_DRIFT",
          details: [action.target],
        });
      }
    } else if (action.operation === "remove") {
      const target = resolve(root, action.target);
      if (await exists(target)) {
        throw new CliError("a removed legacy path was recreated after the recorded transaction", {
          code: "SKILL_ROLLBACK_DRIFT",
          details: [action.target],
        });
      }
    } else if (action.operation === "rewrite") {
      const target = resolve(root, action.target);
      const currentChecksum = await hashFile(target).catch(() => null);
      if (currentChecksum !== action.newChecksum) {
        throw new CliError("a rewritten file changed after the recorded transaction", {
          code: "SKILL_ROLLBACK_DRIFT",
          details: [action.target],
        });
      }
    }
  }
  for (const action of [...candidate.receipt.actions].reverse()) await restoreAction(root, candidate.root, action);
  await restorePreviousManifest(root, candidate.root);
  return { rolledBackTransaction: candidate.transactionId, restoredManifest: await readInstallManifest(root) };
}
