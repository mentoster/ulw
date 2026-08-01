import { createHash, randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { readFile, rename, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { atomicWriteFile } from "../io/atomic-write.mjs";

export const APPROVAL_GRANT_TTL_MS = 10 * 60 * 1000;

function approvalStateRoot(env = process.env) {
  return resolve(env.ULW_APPROVAL_GATE_STATE_ROOT || join(homedir(), ".hermes", "state", "ulw-approval-gate"));
}

function approvalGrantKey(sessionId, workspace) {
  return createHash("sha256").update(`${sessionId}\0${resolve(workspace)}`).digest("hex").slice(0, 32);
}

export function approvalGrantPath({ sessionId, workspace, env = process.env }) {
  return join(approvalStateRoot(env), `${approvalGrantKey(sessionId, workspace)}.json`);
}

async function readGrant(path) {
  const raw = await readFile(path, "utf8").catch((error) => {
    if (error?.code === "ENOENT") return null;
    throw error;
  });
  if (raw === null) return null;
  try { return JSON.parse(raw); }
  catch { return null; }
}

function grantMatches(grant, { sessionId, workspace, slug, sourceStateSha256, now }) {
  return Boolean(
    grant
    && grant.schemaVersion === 1
    && grant.sessionId === sessionId
    && grant.workspace === resolve(workspace)
    && grant.slug === slug
    && typeof sourceStateSha256 === "string"
    && sourceStateSha256.length > 0
    && grant.sourceStateSha256 === sourceStateSha256
    && Number.isFinite(grant.expiresAt)
    && grant.expiresAt >= now,
  );
}

export async function issueHermesApprovalGrant({
  sessionId,
  turnId,
  workspace,
  slug,
  sourceStateSha256,
  userMessage,
  now = Date.now(),
  env = process.env,
}) {
  const path = approvalGrantPath({ sessionId, workspace, env });
  const grant = {
    schemaVersion: 1,
    sessionId,
    turnId,
    workspace: resolve(workspace),
    slug,
    sourceStateSha256,
    issuedAt: now,
    expiresAt: now + APPROVAL_GRANT_TTL_MS,
    userMessageSha256: createHash("sha256").update(userMessage).digest("hex"),
  };
  await atomicWriteFile(path, `${JSON.stringify(grant, null, 2)}\n`, { mode: 0o600 });
  return grant;
}

export async function revokeHermesApprovalGrant({ sessionId, workspace, env = process.env }) {
  await rm(approvalGrantPath({ sessionId, workspace, env }), { force: true });
}

export async function hasHermesApprovalGrant({
  sessionId,
  turnId,
  workspace,
  slug,
  sourceStateSha256,
  now = Date.now(),
  env = process.env,
}) {
  const grant = await readGrant(approvalGrantPath({ sessionId, workspace, env }));
  return grantMatches(grant, { sessionId, workspace, slug, sourceStateSha256, now }) && (!turnId || grant.turnId === turnId);
}

export async function consumeHermesApprovalGrant({
  sessionId,
  workspace,
  slug,
  sourceStateSha256,
  now = Date.now(),
  env = process.env,
}) {
  const path = approvalGrantPath({ sessionId, workspace, env });
  const grant = await readGrant(path);
  if (!grantMatches(grant, { sessionId, workspace, slug, sourceStateSha256, now })) {
    if (grant && Number(grant.expiresAt) < now) await rm(path, { force: true });
    return null;
  }

  const consuming = `${path}.${randomUUID()}.consuming`;
  try {
    await rename(path, consuming);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
  await rm(consuming, { force: true });
  return grant;
}
