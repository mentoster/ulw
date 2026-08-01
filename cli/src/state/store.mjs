import { createHash } from "node:crypto";
import { readdir, readFile, rm } from "node:fs/promises";
import { basename, join } from "node:path";
import { CliError } from "../errors.mjs";
import { atomicWriteJson } from "../io/atomic-write.mjs";
import { assertSlug, ensureSafeDirectory, resolveArtifactTarget } from "../io/path-policy.mjs";
import { assertValidState, CURRENT_STATE_SCHEMA_VERSION } from "./schema.mjs";

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(sortValue(value));
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function stateContentSha256(state) {
  const copy = structuredClone(state);
  copy.generated = { sourceStateSha256: null, draftSha256: null, planSha256: null };
  delete copy.updatedAt;
  return sha256(canonicalJson(copy));
}

export async function statePaths(workspace, slug) {
  assertSlug(slug);
  const root = await resolveArtifactTarget(workspace, join("ulw", slug));
  return {
    root,
    state: join(root, "state.json"),
    history: join(root, "history"),
    inputs: join(root, "inputs"),
    reviews: join(root, "reviews"),
  };
}

export async function loadState(workspace, slug) {
  const paths = await statePaths(workspace, slug);
  let raw;
  try {
    raw = await readFile(paths.state, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") throw new CliError(`plan state not found: ${slug}`, { code: "STATE_NOT_FOUND" });
    throw error;
  }
  let state;
  try {
    state = JSON.parse(raw);
  } catch {
    throw new CliError(`state JSON is corrupt: ${paths.state}`, { code: "STATE_CORRUPT_JSON" });
  }
  if (Number.isInteger(state?.schemaVersion) && state.schemaVersion > CURRENT_STATE_SCHEMA_VERSION) {
    throw new CliError(`state schemaVersion ${state.schemaVersion} is newer than this CLI`, { code: "STATE_SCHEMA_FUTURE" });
  }
  return assertValidState(state);
}

async function pruneHistory(historyPath) {
  const entries = (await readdir(historyPath).catch(() => [])).filter((name) => name.endsWith(".json")).sort();
  const ordinary = entries.filter((name) => name.includes("-ordinary-"));
  for (const name of ordinary.slice(0, Math.max(0, ordinary.length - 50))) await rm(join(historyPath, name), { force: true });
}

export async function writeState(workspace, state, { previous = null, checkpoint = "ordinary", incrementRevision = true } = {}) {
  assertValidState(state);
  if (state.schemaVersion !== CURRENT_STATE_SCHEMA_VERSION) {
    throw new CliError(`state schemaVersion ${state.schemaVersion} must be migrated before mutation`, {
      code: "STATE_MIGRATION_REQUIRED",
      details: [`Run \`ulw plan migrate ${state.slug} --dry-run\`, then confirm with \`--yes\`.`],
    });
  }
  const paths = await statePaths(workspace, state.slug);
  const workspaceRoot = typeof workspace === "string" ? workspace : workspace.workspace;
  await ensureSafeDirectory(workspaceRoot, paths.root);
  await ensureSafeDirectory(workspaceRoot, paths.history);
  if (previous) {
    const previousHash = sha256(canonicalJson(previous)).slice(0, 16);
    const name = `${String(previous.revision).padStart(6, "0")}-${checkpoint}-${previousHash}.json`;
    await atomicWriteJson(join(paths.history, name), previous);
  }
  const next = structuredClone(state);
  if (incrementRevision) next.revision = (previous?.revision ?? next.revision) + 1;
  next.updatedAt = new Date().toISOString();
  assertValidState(next);
  await atomicWriteJson(paths.state, next);
  await pruneHistory(paths.history);
  return next;
}

export async function createState(workspace, state) {
  const paths = await statePaths(workspace, state.slug);
  const existing = await readFile(paths.state, "utf8").catch(() => null);
  if (existing !== null) throw new CliError(`plan state already exists: ${state.slug}`, { code: "STATE_EXISTS" });
  return writeState(workspace, state, { incrementRevision: false });
}

export async function mutateState(workspace, slug, mutator, { checkpoint = "ordinary" } = {}) {
  const previous = await loadState(workspace, slug);
  assertCurrentStateVersion(previous);
  const candidate = await mutator(structuredClone(previous));
  return writeState(workspace, candidate, { previous, checkpoint });
}

export function assertCurrentStateVersion(state) {
  if (state.schemaVersion !== CURRENT_STATE_SCHEMA_VERSION) {
    throw new CliError(`state schemaVersion ${state.schemaVersion} must be migrated before mutation`, {
      code: "STATE_MIGRATION_REQUIRED",
      details: [`Run \`ulw plan migrate ${state.slug} --dry-run\`, then confirm with \`--yes\`.`],
    });
  }
  return state;
}

export async function writeGeneratedState(workspace, state) {
  return writeState(workspace, state, { incrementRevision: false });
}
