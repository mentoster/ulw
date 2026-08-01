import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  hasHermesApprovalGrant,
  issueHermesApprovalGrant,
  revokeHermesApprovalGrant,
} from "./hermes-approval-grant.mjs";

const EXPLICIT_APPROVAL = /^(?:\/?approve|approved|одобряю|утверждаю|согласен|согласна)(?:\s+([a-z0-9][a-z0-9._-]*))?$/iu;
const APPROVE_COMMAND = /(?:^|[;&|]\s*)(?:(?:node|bun)\s+\S*ulw(?:\.mjs)?|(?:\S*\/)?ulw)\s+plan\s+approve\s+([a-z0-9][a-z0-9._-]*)/iu;

function normalizedUserMessage(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/[.!?]+$/u, "")
    .replace(/\s+/gu, " ");
}

function approvalRequest(value) {
  const message = normalizedUserMessage(value);
  const match = message.match(EXPLICIT_APPROVAL);
  return match ? { message, slug: match[1] ?? null } : null;
}

async function awaitingApprovalPlans(runtimeContext) {
  const root = join(runtimeContext.artifactRoot, "ulw");
  const plans = [];
  for (const entry of await readdir(root, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const state = await readFile(join(root, entry.name, "state.json"), "utf8")
      .then((raw) => JSON.parse(raw))
      .catch(() => null);
    if (
      state?.slug === entry.name
      && state?.status === "awaiting-approval"
      && !state?.approval
      && typeof state?.generated?.sourceStateSha256 === "string"
      && state.generated.sourceStateSha256
    ) {
      plans.push({ slug: entry.name, sourceStateSha256: state.generated.sourceStateSha256 });
    }
  }
  return plans.sort((left, right) => left.slug.localeCompare(right.slug));
}

function toolCommand(payload) {
  const input = payload?.tool_input;
  if (!input || typeof input !== "object") return "";
  for (const key of ["command", "cmd", "code", "script"]) {
    if (typeof input[key] === "string") return input[key];
  }
  return "";
}

function approvalCommandSlug(payload) {
  const match = toolCommand(payload).match(APPROVE_COMMAND);
  return match?.[1] ?? null;
}

async function handlePreLlmCall(payload, runtimeContext, env) {
  const sessionId = String(payload.session_id ?? "").trim();
  if (!sessionId) return {};
  await revokeHermesApprovalGrant({ sessionId, workspace: runtimeContext.workspace, env });

  const extra = payload.extra && typeof payload.extra === "object" ? payload.extra : {};
  const request = approvalRequest(extra.user_message);
  if (!request) return {};

  const awaiting = await awaitingApprovalPlans(runtimeContext);
  let slug = request.slug;
  if (slug && !awaiting.some((plan) => plan.slug === slug)) {
    return {
      context: `ULW approval gate: no plan named ${slug} is awaiting approval. Do not call plan approve.`,
    };
  }
  if (!slug && awaiting.length === 1) slug = awaiting[0].slug;
  if (!slug && awaiting.length !== 1) {
    const detail = awaiting.length ? `Awaiting plans: ${awaiting.map((plan) => plan.slug).join(", ")}.` : "No plan is awaiting approval.";
    return {
      context: `ULW approval gate: approval was not recorded because the target is ambiguous. ${detail} Ask the user to send \`approve <slug>\`.`,
    };
  }
  const selected = awaiting.find((plan) => plan.slug === slug);

  await issueHermesApprovalGrant({
    sessionId,
    turnId: String(extra.turn_id ?? ""),
    workspace: runtimeContext.workspace,
    slug,
    sourceStateSha256: selected.sourceStateSha256,
    userMessage: request.message,
    env,
  });
  return {
    context: `ULW approval gate: explicit user approval was recorded for ${slug} in this turn. You may call \`ulw plan approve ${slug}\` once.`,
  };
}

async function handlePreToolCall(payload, runtimeContext, env) {
  const slug = approvalCommandSlug(payload);
  if (!slug) return {};
  const extra = payload.extra && typeof payload.extra === "object" ? payload.extra : {};
  const plan = (await awaitingApprovalPlans(runtimeContext)).find((item) => item.slug === slug);
  if (!plan) {
    return {
      action: "block",
      message: `ULW approval gate blocked ${slug}: the plan is not awaiting approval at the approved revision.`,
    };
  }
  const allowed = await hasHermesApprovalGrant({
    sessionId: String(payload.session_id ?? "").trim(),
    turnId: String(extra.turn_id ?? ""),
    workspace: runtimeContext.workspace,
    slug,
    sourceStateSha256: plan.sourceStateSha256,
    env,
  });
  if (allowed) return {};
  return {
    action: "block",
    message: `ULW approval gate blocked ${slug}: the current user turn did not explicitly approve this plan. Present the brief and stop.`,
  };
}

export async function handleHermesApprovalHook(payload, runtimeContext, env = process.env) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};
  if (payload.hook_event_name === "pre_llm_call") return handlePreLlmCall(payload, runtimeContext, env);
  if (payload.hook_event_name === "pre_tool_call") return handlePreToolCall(payload, runtimeContext, env);
  return {};
}
