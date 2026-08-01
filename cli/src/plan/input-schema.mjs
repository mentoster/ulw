import { CliError } from "../errors.mjs";
import { assertValidState } from "../state/schema.mjs";

const ALLOWED_FIELDS = new Set([
  "summary", "components", "findings", "decisions", "assumptions", "scope", "verification",
  "approvalBrief", "todos", "commitStrategy", "successCriteria", "finalVerification", "readyForApproval",
]);

export function applyPlanInput(state, input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new CliError("plan input must be a JSON object", { code: "PLAN_INPUT_TYPE" });
  }
  const unknown = Object.keys(input).filter((key) => !ALLOWED_FIELDS.has(key));
  if (unknown.length > 0) {
    throw new CliError("plan input contains unknown fields", {
      code: "PLAN_INPUT_UNKNOWN_FIELDS",
      details: unknown.sort(),
    });
  }
  const next = structuredClone(state);
  for (const key of ALLOWED_FIELDS) {
    if (key === "readyForApproval" || input[key] === undefined) continue;
    next[key] = structuredClone(input[key]);
  }
  if (input.readyForApproval !== undefined && typeof input.readyForApproval !== "boolean") {
    throw new CliError("readyForApproval must be boolean", { code: "PLAN_INPUT_READY_TYPE" });
  }
  if (input.readyForApproval === true) next.status = "awaiting-approval";
  return assertValidState(next);
}
