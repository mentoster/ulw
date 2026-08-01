import { cp, lstat, mkdir, rename, rm } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { CLI_VERSION } from "../command-registry.mjs";
import { CliError } from "../errors.mjs";
import { summarizeActions } from "./action-plan.mjs";
import { checkSkillsRoot } from "./check.mjs";
import { FAMILY, packageRoot } from "./constants.mjs";
import { buildInstallManifest, manifestDigest } from "./install-manifest.mjs";
import { hashTree } from "./tree-hash.mjs";
import { abandonTransaction, beginTransaction, commitTransaction, readInstallManifest, transactionRecords } from "./transaction-store.mjs";

async function exists(path) { return Boolean(await lstat(path).catch(() => null)); }
function slash(value) { return value.split("\\").join("/"); }

export async function assertOwnedTreesMatch(skillsRoot, manifest) {
  if (!manifest || manifest.status !== "installed") return;
  const errors = [];
  for (const [name, record] of Object.entries(manifest.skills)) {
    const checksum = await hashTree(join(skillsRoot, record.path));
    if (checksum !== record.checksum) errors.push(`${name}: expected ${record.checksum}, got ${checksum ?? "missing"}`);
  }
  if (errors.length) throw new CliError("installed owned files changed outside the ULW lifecycle", { code: "SKILL_LIFECYCLE_DRIFT", details: errors });
}

export async function uninstallSkills(skillsRoot, { dryRun = false } = {}) {
  const root = resolve(skillsRoot);
  const current = await readInstallManifest(root);
  if (!current) throw new CliError("skill ownership manifest is absent; uninstall cannot identify owned files", { code: "SKILL_UNINSTALL_MANIFEST_MISSING" });
  if (current.status === "uninstalled") return { actions: [], summary: summarizeActions([]), changed: [], transactionId: null, manifest: current };
  await assertOwnedTreesMatch(root, current);
  const actions = Object.entries(current.skills).map(([skill, record]) => ({
    skill,
    path: join(root, record.path),
    target: slash(record.path),
    operation: "remove",
    oldChecksum: record.checksum,
    newChecksum: null,
    reason: "manifest-owned skill tree is being uninstalled",
  }));
  const summary = summarizeActions(actions);
  if (dryRun) return { actions, summary, changed: actions.map((item) => item.path), transactionId: null, manifest: current };
  const transaction = await beginTransaction(root, { operation: "uninstall", actions });
  const applied = [];
  try {
    for (const action of actions) {
      const backup = join(transaction.backups, "family", action.skill);
      await mkdir(dirname(backup), { recursive: true });
      await rename(action.path, backup);
      action.backup = slash(relative(transaction.root, backup));
      applied.push({ target: action.path, backup });
    }
    const manifest = buildInstallManifest({
      cliVersion: CLI_VERSION,
      packageVersion: current.packageVersion,
      operation: "uninstall",
      transactionId: transaction.transactionId,
      previousManifest: current,
      skills: {},
      status: "uninstalled",
    });
    const receipt = {
      schemaVersion: 1,
      status: "committed",
      transactionId: transaction.transactionId,
      operation: "uninstall",
      startedAt: transaction.intent.startedAt,
      committedAt: new Date().toISOString(),
      previousManifestDigest: manifestDigest(current),
      manifestDigest: manifestDigest(manifest),
      actions: actions.map(({ path, ...item }) => item),
    };
    await commitTransaction(transaction, { receipt, manifest });
    return { actions: receipt.actions, summary, changed: actions.map((item) => item.path), transactionId: transaction.transactionId, manifest };
  } catch (error) {
    for (const item of applied.reverse()) {
      await mkdir(dirname(item.target), { recursive: true });
      await rename(item.backup, item.target).catch(() => {});
    }
    await abandonTransaction(transaction);
    throw error;
  }
}

async function targetCandidates(skillsRoot) {
  const current = await readInstallManifest(skillsRoot);
  const records = await transactionRecords(skillsRoot);
  const candidates = [];
  if (current) candidates.push({ manifest: current, source: "current" });
  for (const record of [...records].reverse()) {
    if (record.manifest) candidates.push({ manifest: record.manifest, source: record.root });
    if (record.previousManifest) candidates.push({ manifest: record.previousManifest, source: `${record.root}:previous` });
  }
  const unique = new Map();
  for (const candidate of candidates) {
    const key = `${candidate.manifest.transactionId}:${candidate.manifest.status}:${candidate.manifest.packageVersion}`;
    if (!unique.has(key)) unique.set(key, candidate);
  }
  return { current, records, candidates: [...unique.values()] };
}

async function findTreeSource(skillsRoot, checksum, skill, records) {
  const currentPath = join(skillsRoot, "software-development", skill);
  if (await hashTree(currentPath) === checksum) return currentPath;
  const bundled = join(packageRoot, skill);
  if (await hashTree(bundled) === checksum) return bundled;
  for (const record of [...records].reverse()) {
    const snapshot = join(record.root, "snapshot", skill);
    if (await hashTree(snapshot) === checksum) return snapshot;
    for (const action of record.receipt.actions ?? []) {
      if (action.skill !== skill || !action.backup) continue;
      const backup = resolve(record.root, action.backup);
      if (await hashTree(backup) === checksum) return backup;
    }
  }
  throw new CliError(`no verified retained bytes exist for ${skill} checksum ${checksum}`, { code: "SKILL_ROLLBACK_SOURCE_MISSING" });
}

function chooseTarget(candidates, { version, transactionId }) {
  if (version) return candidates.find((item) => item.manifest.packageVersion === version && item.manifest.status === "installed")
    ?? candidates.find((item) => item.manifest.packageVersion === version)
    ?? null;
  if (transactionId) return candidates.find((item) => item.manifest.transactionId === transactionId) ?? null;
  return null;
}

export async function restoreSkillSelection(skillsRoot, { version = null, transactionId = null, dryRun = false } = {}) {
  if (!version && !transactionId) throw new CliError("selected rollback requires --version or --transaction", { code: "SKILL_ROLLBACK_SELECTION_REQUIRED" });
  if (version && transactionId) throw new CliError("use only one of --version or --transaction", { code: "SKILL_ROLLBACK_SELECTION_CONFLICT" });
  const root = resolve(skillsRoot);
  const { current, records, candidates } = await targetCandidates(root);
  if (!current) throw new CliError("skill ownership manifest is absent", { code: "SKILL_ROLLBACK_EMPTY" });
  await assertOwnedTreesMatch(root, current);
  const selected = chooseTarget(candidates, { version, transactionId });
  if (!selected) throw new CliError("requested rollback target is not retained", { code: "SKILL_ROLLBACK_TARGET_NOT_FOUND" });
  const targetManifest = selected.manifest;
  if (targetManifest.transactionId === current.transactionId && targetManifest.status === current.status) {
    return { actions: [], summary: summarizeActions([]), changed: [], transactionId: null, manifest: current, selected: { version: targetManifest.packageVersion, transactionId: targetManifest.transactionId } };
  }
  const names = new Set([...Object.keys(current.skills ?? {}), ...Object.keys(targetManifest.skills ?? {})]);
  const actions = [];
  for (const skill of names) {
    const currentRecord = current.skills?.[skill] ?? null;
    const targetRecord = targetManifest.skills?.[skill] ?? null;
    const path = join(root, currentRecord?.path ?? targetRecord?.path ?? join("software-development", skill));
    if (!targetRecord) actions.push({ skill, path, target: slash(relative(root, path)), operation: "remove", oldChecksum: currentRecord.checksum, newChecksum: null, reason: "selected target does not own this skill" });
    else if (currentRecord?.checksum === targetRecord.checksum) actions.push({ skill, path, target: slash(relative(root, path)), operation: "unchanged", oldChecksum: currentRecord.checksum, newChecksum: targetRecord.checksum, reason: "current bytes already match selected target" });
    else actions.push({ skill, path, target: slash(relative(root, path)), operation: currentRecord ? "update" : "create", oldChecksum: currentRecord?.checksum ?? null, newChecksum: targetRecord.checksum, reason: "restore selected retained skill version", source: await findTreeSource(root, targetRecord.checksum, skill, records) });
  }
  const mutations = actions.filter((item) => item.operation !== "unchanged");
  const summary = summarizeActions(actions);
  if (dryRun) return { actions: actions.map(({ source, ...item }) => item), summary, changed: mutations.map((item) => item.path), transactionId: null, manifest: current, selected: { version: targetManifest.packageVersion, transactionId: targetManifest.transactionId } };
  const transaction = await beginTransaction(root, { operation: "rollback-selected", actions: mutations });
  const applied = [];
  try {
    for (const action of mutations) {
      const backup = join(transaction.backups, "family", action.skill);
      if (await exists(action.path)) {
        await mkdir(dirname(backup), { recursive: true });
        await rename(action.path, backup);
      }
      if (action.operation !== "remove") {
        const staged = join(transaction.stage, "family", action.skill);
        await mkdir(dirname(staged), { recursive: true });
        await cp(action.source, staged, { recursive: true, force: true });
        if (await hashTree(staged) !== action.newChecksum) throw new CliError(`staged rollback checksum mismatch: ${action.skill}`, { code: "SKILL_ROLLBACK_CHECKSUM" });
        await mkdir(dirname(action.path), { recursive: true });
        await rename(staged, action.path);
      }
      action.backup = await exists(backup) ? slash(relative(transaction.root, backup)) : null;
      applied.push({ target: action.path, backup: await exists(backup) ? backup : null });
    }
    if (targetManifest.status === "installed") {
      const errors = await checkSkillsRoot(root, { checkManifest: false, expectedCliVersion: targetManifest.packageVersion });
      if (errors.length) throw new CliError("selected rollback target failed skill validation", { code: "SKILL_ROLLBACK_POSTCHECK", details: errors });
    } else for (const name of FAMILY) if (await exists(join(root, "software-development", name))) throw new CliError(`uninstalled target still contains ${name}`, { code: "SKILL_ROLLBACK_POSTCHECK" });
    const manifest = buildInstallManifest({
      cliVersion: CLI_VERSION,
      packageVersion: targetManifest.packageVersion,
      operation: "rollback-selected",
      transactionId: transaction.transactionId,
      previousManifest: current,
      skills: targetManifest.skills,
      status: targetManifest.status,
    });
    const receipt = {
      schemaVersion: 1,
      status: "committed",
      transactionId: transaction.transactionId,
      operation: "rollback-selected",
      startedAt: transaction.intent.startedAt,
      committedAt: new Date().toISOString(),
      previousManifestDigest: manifestDigest(current),
      manifestDigest: manifestDigest(manifest),
      selected: { version: targetManifest.packageVersion, transactionId: targetManifest.transactionId },
      actions: mutations.map(({ source, path, ...item }) => item),
    };
    await commitTransaction(transaction, { receipt, manifest });
    return { actions: receipt.actions, summary, changed: mutations.map((item) => item.path), transactionId: transaction.transactionId, manifest, selected: receipt.selected };
  } catch (error) {
    for (const item of applied.reverse()) {
      await rm(item.target, { recursive: true, force: true }).catch(() => {});
      if (item.backup) {
        await mkdir(dirname(item.target), { recursive: true });
        await rename(item.backup, item.target).catch(() => {});
      }
    }
    await abandonTransaction(transaction);
    throw error;
  }
}
