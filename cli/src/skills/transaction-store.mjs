import { randomUUID } from "node:crypto";
import { cp, lstat, mkdir, readFile, readdir, rename, rm } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { atomicWriteJson } from "../io/atomic-write.mjs";
import { CliError } from "../errors.mjs";
import { TRANSACTION_RETENTION, validateInstallManifest } from "./install-manifest.mjs";
import { assertSkillsPathSafe } from "./path-policy.mjs";

export function controlPaths(skillsRoot) {
  const absoluteRoot = resolve(skillsRoot);
  const control = join(dirname(absoluteRoot), ".ulw-skill-state", basename(absoluteRoot));
  return {
    control,
    manifest: join(control, "manifest.json"),
    intent: join(control, "intent.json"),
    transactions: join(control, "transactions"),
  };
}

export function legacyControlPaths(skillsRoot) {
  const control = join(resolve(skillsRoot), ".ulw");
  return {
    control,
    manifest: join(control, "manifest.json"),
    intent: join(control, "intent.json"),
    transactions: join(control, "transactions"),
  };
}

async function migrateLegacyControlRoot(skillsRoot) {
  const current = controlPaths(skillsRoot);
  const legacy = legacyControlPaths(skillsRoot);
  const legacyStat = await lstat(legacy.control).catch((error) => {
    if (error?.code === "ENOENT") return null;
    throw error;
  });
  if (!legacyStat) return current;
  if (legacyStat.isSymbolicLink()) {
    throw new CliError(`legacy skill control root is a symlink: ${legacy.control}`, { code: "SKILL_PATH_SYMLINK" });
  }
  const currentStat = await lstat(current.control).catch((error) => {
    if (error?.code === "ENOENT") return null;
    throw error;
  });
  if (currentStat) {
    throw new CliError("both legacy and current skill control roots exist", {
      code: "SKILL_CONTROL_MIGRATION_COLLISION",
      details: [legacy.control, current.control],
    });
  }
  await assertSkillsPathSafe(dirname(current.control));
  await mkdir(dirname(current.control), { recursive: true });
  await rename(legacy.control, current.control);
  return current;
}

async function readJson(path) {
  const raw = await readFile(path, "utf8").catch((error) => {
    if (error?.code === "ENOENT") return null;
    throw error;
  });
  if (raw === null) return null;
  try { return JSON.parse(raw); }
  catch { throw new CliError(`invalid JSON: ${path}`, { code: "SKILL_CONTROL_CORRUPT" }); }
}

export async function ensureControlRoot(skillsRoot) {
  const paths = await migrateLegacyControlRoot(skillsRoot);
  await assertSkillsPathSafe(skillsRoot);
  await assertSkillsPathSafe(paths.control);
  await mkdir(paths.transactions, { recursive: true });
  await assertSkillsPathSafe(paths.transactions);
  return paths;
}

export async function readInstallManifest(skillsRoot) {
  const paths = await migrateLegacyControlRoot(skillsRoot);
  const manifest = await readJson(paths.manifest);
  if (manifest) {
    const errors = validateInstallManifest(manifest);
    if (errors.length) throw new CliError("installed skill manifest is invalid", { code: "SKILL_MANIFEST_INVALID", details: errors });
  }
  return manifest;
}

export async function readIntent(skillsRoot) {
  const paths = await migrateLegacyControlRoot(skillsRoot);
  return readJson(paths.intent);
}

export async function assertNoInterruptedTransaction(skillsRoot) {
  const intent = await readIntent(skillsRoot);
  if (intent) {
    throw new CliError("an interrupted skill transaction requires recovery before another mutation", {
      code: "SKILL_TRANSACTION_INTERRUPTED",
      details: [`transaction: ${intent.transactionId ?? "unknown"}`, "Run `ulw doctor --json` and restore or remove the interrupted transaction only after inspection."],
    });
  }
}

export async function beginTransaction(skillsRoot, { operation, actions }) {
  await assertNoInterruptedTransaction(skillsRoot);
  const paths = await ensureControlRoot(skillsRoot);
  const transactionId = `${new Date().toISOString().replaceAll(/[:.]/g, "-")}-${randomUUID()}`;
  const root = join(paths.transactions, transactionId);
  const backups = join(root, "backups");
  const stage = join(root, "stage");
  await mkdir(backups, { recursive: true });
  await mkdir(stage, { recursive: true });
  await assertSkillsPathSafe(root);
  const previousManifest = await readInstallManifest(skillsRoot);
  if (previousManifest) await atomicWriteJson(join(root, "previous-manifest.json"), previousManifest);
  const intent = {
    schemaVersion: 1,
    transactionId,
    operation,
    startedAt: new Date().toISOString(),
    actions: actions.map(({ source, ...action }) => action),
  };
  await atomicWriteJson(paths.intent, intent);
  return { transactionId, root, backups, stage, previousManifest, paths, intent, skillsRoot };
}

export async function commitTransaction(transaction, { receipt, manifest }) {
  const snapshotRoot = join(transaction.root, "snapshot");
  await mkdir(snapshotRoot, { recursive: true });
  if (manifest.status === "installed") {
    for (const [name, record] of Object.entries(manifest.skills)) {
      const source = join(transaction.skillsRoot, record.path);
      const target = join(snapshotRoot, name);
      await cp(source, target, { recursive: true, force: true });
    }
  }
  await atomicWriteJson(join(transaction.root, "receipt.json"), receipt);
  await atomicWriteJson(join(transaction.root, "manifest.json"), manifest);
  await atomicWriteJson(transaction.paths.manifest, manifest);
  await rm(transaction.paths.intent, { force: true });
  await pruneTransactions(transaction.paths.transactions, { keep: manifest.transactionId });
}

export async function abandonTransaction(transaction) {
  await rm(transaction.paths.intent, { force: true }).catch(() => {});
  await rm(transaction.root, { recursive: true, force: true }).catch(() => {});
}

export async function transactionRecords(skillsRoot) {
  const paths = await migrateLegacyControlRoot(skillsRoot);
  const output = [];
  for (const entry of await readdir(paths.transactions, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const root = join(paths.transactions, entry.name);
    const receipt = await readJson(join(root, "receipt.json")).catch(() => null);
    const manifest = await readJson(join(root, "manifest.json")).catch(() => null);
    const previousManifest = await readJson(join(root, "previous-manifest.json")).catch(() => null);
    if (receipt?.status === "committed") output.push({ transactionId: entry.name, root, receipt, manifest, previousManifest });
  }
  output.sort((left, right) => left.receipt.committedAt.localeCompare(right.receipt.committedAt));
  return output;
}

export async function pruneTransactions(transactionsRoot, { keep } = {}) {
  const records = [];
  for (const entry of await readdir(transactionsRoot, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const root = join(transactionsRoot, entry.name);
    const receipt = await readJson(join(root, "receipt.json")).catch(() => null);
    if (receipt?.status === "committed") records.push({ id: entry.name, root, committedAt: receipt.committedAt });
  }
  records.sort((left, right) => left.committedAt.localeCompare(right.committedAt));
  const removable = records.filter((item) => item.id !== keep).slice(0, Math.max(0, records.length - TRANSACTION_RETENTION));
  for (const item of removable) await rm(item.root, { recursive: true, force: true });
}

export async function restorePreviousManifest(skillsRoot, transactionRoot) {
  const paths = await migrateLegacyControlRoot(skillsRoot);
  const previous = await readJson(join(transactionRoot, "previous-manifest.json"));
  if (previous) await atomicWriteJson(paths.manifest, previous);
  else await rm(paths.manifest, { force: true });
}
