import { parseOptions, requirePositional } from "../args.mjs";
import { CliError } from "../errors.mjs";
import { assertGeneratedClean } from "../plan/generated-drift.mjs";
import { validatePlanState } from "../plan/validate-plan.mjs";
import { renderArtifacts } from "../plan/render-artifacts.mjs";
import { canonicalJson, loadState, mutateState, sha256 } from "../state/store.mjs";
import { consumeHermesApprovalGrant } from "../host/hermes-approval-grant.mjs";
import { output } from "./command-io.mjs";

async function handler(argv, io, runtimeContext) {
  const { positionals, options } = parseOptions(argv, { json: "boolean" });
  const slug = requirePositional(positionals, 0, "slug");
  const current = await loadState(runtimeContext, slug);
  if (current.approval && ["approved", "reviewing", "revision-required", "blocked", "finalized"].includes(current.status)) {
    output(io, { slug, status: current.status, approval: current.approval, resumed: true }, options.json);
    return 0;
  }
  if (current.status !== "awaiting-approval") throw new CliError("plan is not awaiting approval", { code: "PLAN_APPROVAL_STATE" });
  await assertGeneratedClean(runtimeContext, current);
  const diagnostics = await validatePlanState(current, runtimeContext);
  if (diagnostics.length) throw new CliError("plan is incomplete and cannot be approved", { code: "PLAN_APPROVAL_INCOMPLETE", details: diagnostics.map((item) => `${item.code}: ${item.message}`) });
  const hermesSessionId = process.env.HERMES_SESSION_ID?.trim();
  if (hermesSessionId) {
    const grant = await consumeHermesApprovalGrant({
      sessionId: hermesSessionId,
      workspace: runtimeContext.workspace,
      slug,
      sourceStateSha256: current.generated.sourceStateSha256,
    });
    if (!grant) {
      throw new CliError("Hermes approval requires evidence from a separate explicit user turn", {
        code: "PLAN_APPROVAL_USER_TURN_REQUIRED",
        details: [
          "Ask the user to send `approve` as a new message after the approval brief.",
          "The Hermes approval hook must be enabled so that turn can issue a one-time grant.",
        ],
      });
    }
  }
  let state = await mutateState(runtimeContext, slug, (next) => {
    next.status = "approved";
    next.approval = {
      approvedAt: new Date().toISOString(),
      snapshotSha256: sha256(canonicalJson({ scope: next.scope, decisions: next.decisions, summary: next.summary })),
    };
    return next;
  }, { checkpoint: "approval" });
  state = await renderArtifacts(runtimeContext, state);
  output(io, { slug, status: state.status, approval: state.approval }, options.json);
  return 0;
}
export function register(registerCommand) { registerCommand("plan", "approve", handler); }
