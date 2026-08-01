import { cp, lstat, mkdir, readFile, rename } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { CLI_VERSION } from "../command-registry.mjs";
import { atomicWriteFile } from "../io/atomic-write.mjs";
import { CliError } from "../errors.mjs";
import { summarizeActions } from "./action-plan.mjs";
import { checkLegacyCleanliness } from "./check.mjs";
import { LEGACY_DIRECTORIES } from "./constants.mjs";
import { buildInstallManifest, manifestDigest } from "./install-manifest.mjs";
import { installedSkillRecords } from "./install-transaction.mjs";
import { markdownFiles, migrateText } from "./migrate-references.mjs";
import { hashFile, hashTree } from "./tree-hash.mjs";
import { abandonTransaction, beginTransaction, commitTransaction } from "./transaction-store.mjs";
import { assertSkillsPathSafe } from "./path-policy.mjs";

async function exists(path) { return Boolean(await lstat(path).catch(() => null)); }

export async function planLegacyMigration(skillsRoot) {
  const root = resolve(skillsRoot);
  const actions = [];
  for (const relativePath of LEGACY_DIRECTORIES) {
    const target = join(root, relativePath);
    const oldChecksum = await hashTree(target);
    if (oldChecksum) actions.push({ operation: "remove", path: target, target: relativePath.split("\\").join("/"), oldChecksum, newChecksum: null, reason: "legacy skill directory exists" });
  }
  for (const path of await markdownFiles(root)) {
    if (path.includes(`${join(root, ".ulw")}`)) continue;
    const original = await readFile(path, "utf8");
    const migrated = migrateText(original);
    if (migrated === original) continue;
    actions.push({
      operation: "rewrite",
      path,
      target: relative(root, path).split("\\").join("/"),
      oldChecksum: await hashFile(path),
      newChecksum: (await import("node:crypto")).createHash("sha256").update(migrated).digest("hex"),
      reason: "explicit legacy skill reference requires migration",
      content: migrated,
    });
  }
  return actions;
}

export async function migrateLegacy(skillsRoot, { dryRun = false, yes = false, forcePostCheckFailure = false } = {}) {
  const root = resolve(skillsRoot);
  await assertSkillsPathSafe(root);
  const actions = await planLegacyMigration(root);
  const summary = summarizeActions(actions);
  if (dryRun || actions.length === 0) return { actions: actions.map(({ content, ...item }) => item), summary, changed: actions.map((item) => item.path), transactionId: null };
  if (!yes) throw new CliError("legacy migration requires explicit --yes confirmation", { code: "SKILL_MIGRATION_CONFIRMATION_REQUIRED" });
  const transaction = await beginTransaction(root, { operation: "migrate-legacy", actions });
  const applied = [];
  try {
    for (let index = 0; index < actions.length; index += 1) {
      const action = actions[index];
      const backup = join(transaction.backups, String(index));
      await mkdir(dirname(backup), { recursive: true });
      if (action.operation === "remove") {
        await rename(action.path, backup);
      } else {
        await cp(action.path, backup, { force: true });
        await atomicWriteFile(action.path, action.content);
      }
      action.backup = relative(transaction.root, backup).split("\\").join("/");
      applied.push(action);
    }
    const cleanliness = forcePostCheckFailure ? ["forced legacy post-check failure"] : await checkLegacyCleanliness(root);
    if (cleanliness.length) throw new CliError("legacy migration post-check failed", { code: "SKILL_MIGRATION_POSTCHECK_FAILED", details: cleanliness });
    const skills = await installedSkillRecords(root);
    const manifest = buildInstallManifest({
      cliVersion: CLI_VERSION,
      packageVersion: CLI_VERSION,
      operation: "migrate-legacy",
      transactionId: transaction.transactionId,
      previousManifest: transaction.previousManifest,
      skills,
    });
    const receipt = {
      schemaVersion: 1,
      status: "committed",
      transactionId: transaction.transactionId,
      operation: "migrate-legacy",
      startedAt: transaction.intent.startedAt,
      committedAt: new Date().toISOString(),
      previousManifestDigest: manifestDigest(transaction.previousManifest),
      manifestDigest: manifestDigest(manifest),
      actions: actions.map(({ content, path, ...item }) => item),
    };
    await commitTransaction(transaction, { receipt, manifest });
    return { actions: receipt.actions, summary, changed: actions.map((item) => item.path), transactionId: transaction.transactionId };
  } catch (error) {
    for (const action of applied.reverse()) {
      const backup = resolve(transaction.root, action.backup);
      if (action.operation === "remove") {
        await mkdir(dirname(action.path), { recursive: true });
        await rename(backup, action.path).catch(() => {});
      } else {
        await cp(backup, action.path, { force: true }).catch(() => {});
      }
    }
    await abandonTransaction(transaction);
    throw error;
  }
}
