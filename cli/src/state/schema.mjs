import { CliError } from "../errors.mjs";

const INTENTS = new Set(["clear", "unclear"]);
const DEPTHS = new Set(["quick", "standard", "architecture"]);
const STATUSES = new Set([
  "drafting",
  "awaiting-approval",
  "approved",
  "reviewing",
  "revision-required",
  "blocked",
  "finalized",
]);
const TOP_LEVEL_FIELDS = new Set([
  "schemaVersion", "provenance", "slug", "intent", "depth", "status", "revision", "createdAt", "updatedAt",
  "approval", "repository", "summary", "components", "findings", "decisions", "assumptions", "scope",
  "verification", "approvalBrief", "todos", "review", "generated", "commitStrategy", "successCriteria", "finalVerification",
]);
const FIELD_SETS = Object.freeze({
  summary: new Set(["whatYouGet", "whyThisApproach", "whatItWillNotDo", "effort", "risk", "decisionsToCheck"]),
  component: new Set(["id", "outcome", "status", "evidence"]),
  finding: new Set(["text", "evidence"]),
  decision: new Set(["decision", "rationale", "owner", "evidence"]),
  assumption: new Set(["assumption", "default", "rationale", "reversible", "rollback"]),
  scope: new Set(["mustHave", "mustNotHave", "preserve", "migrationRollback"]),
  verification: new Set(["testDecision", "commands", "evidenceRoot", "misleadingSuccess"]),
  approvalBrief: new Set(["confirmedFacts", "approach", "alternatives", "scopeSummary", "ownerDecisions", "testStrategy"]),
  todo: new Set(["id", "title", "component", "files", "whatToDo", "mustNotDo", "dependsOn", "blocks", "references", "acceptance", "qaHappy", "qaFailure", "evidence", "commit"]),
  file: new Set(["action", "path"]),
  approval: new Set(["approvedAt", "snapshotSha256"]),
  repository: new Set(["workspaceRoot", "git", "instructions", "manifests", "lockfiles", "workflows", "packages", "capturedAt"]),
  git: new Set(["head", "branch", "status"]),
  package: new Set(["path", "name", "scripts", "invalid"]),
  review: new Set(["maxRounds", "currentRound", "rounds", "final"]),
  round: new Set(["round", "reviewContentSha256", "preparedAt", "updatedAt", "planCritic", "architectureVerifier"]),
  receipt: new Set(["role", "roleLabel", "verdict", "round", "reviewContentSha256", "summary", "findingsText", "unverifiedText"]),
  final: new Set(["round", "reviewContentSha256", "finalizedAt"]),
  generated: new Set(["sourceStateSha256", "draftSha256", "planSha256"]),
  provenance: new Set(["createdByCliVersion", "migratedByCliVersion", "profile", "artifactRoot"]),
});

export const CURRENT_STATE_SCHEMA_VERSION = 2;

function diagnostic(path, code, message) {
  return { path, code, message };
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function rejectUnknown(value, path, allowed, errors) {
  if (!isObject(value)) return;
  for (const key of Object.keys(value)) if (!allowed.has(key)) errors.push(diagnostic(`${path}.${key}`, "STATE_UNKNOWN_FIELD", "unknown nested state field"));
}

export function validateTodo(todo, index) {
  const base = `todos[${index}]`;
  const errors = [];
  if (!todo || typeof todo !== "object" || Array.isArray(todo)) return [diagnostic(base, "STATE_TODO_TYPE", "todo must be an object")];
  rejectUnknown(todo, base, FIELD_SETS.todo, errors);
  for (const key of ["id", "title", "component", "whatToDo", "mustNotDo", "acceptance", "qaHappy", "qaFailure", "evidence", "commit"]) {
    if (typeof todo[key] !== "string" || todo[key].trim() === "") errors.push(diagnostic(`${base}.${key}`, "STATE_TODO_REQUIRED", `${key} must be a non-empty string`));
  }
  for (const key of ["dependsOn", "blocks", "references", "files"]) {
    if (!Array.isArray(todo[key])) errors.push(diagnostic(`${base}.${key}`, "STATE_TODO_ARRAY", `${key} must be an array`));
  }
  if (Array.isArray(todo.files)) {
    todo.files.forEach((file, fileIndex) => {
      rejectUnknown(file, `${base}.files[${fileIndex}]`, FIELD_SETS.file, errors);
      if (!file || typeof file.path !== "string" || !["create", "modify", "delete", "test"].includes(file.action)) {
        errors.push(diagnostic(`${base}.files[${fileIndex}]`, "STATE_TODO_FILE", "file requires action=create|modify|delete|test and path"));
      }
    });
  }
  return errors;
}

export function validateState(state) {
  const errors = [];
  if (!state || typeof state !== "object" || Array.isArray(state)) return [diagnostic("$", "STATE_TYPE", "state must be an object")];
  for (const key of Object.keys(state)) if (!TOP_LEVEL_FIELDS.has(key)) errors.push(diagnostic(key, "STATE_UNKNOWN_FIELD", "unknown state field"));
  if (![1, CURRENT_STATE_SCHEMA_VERSION].includes(state.schemaVersion)) errors.push(diagnostic("schemaVersion", "STATE_SCHEMA_VERSION", `supported schema versions are 1 and ${CURRENT_STATE_SCHEMA_VERSION}`));
  if (state.schemaVersion === CURRENT_STATE_SCHEMA_VERSION) {
    rejectUnknown(state.provenance, "provenance", FIELD_SETS.provenance, errors);
    if (!isObject(state.provenance)) errors.push(diagnostic("provenance", "STATE_PROVENANCE", "schemaVersion 2 requires provenance"));
    else {
      for (const key of ["createdByCliVersion", "profile", "artifactRoot"]) if (typeof state.provenance[key] !== "string" || !state.provenance[key]) errors.push(diagnostic(`provenance.${key}`, "STATE_PROVENANCE", `${key} must be a non-empty string`));
      if (state.provenance.migratedByCliVersion !== null && (typeof state.provenance.migratedByCliVersion !== "string" || !state.provenance.migratedByCliVersion)) errors.push(diagnostic("provenance.migratedByCliVersion", "STATE_PROVENANCE", "migratedByCliVersion must be null or a non-empty string"));
    }
  } else if (state.provenance !== undefined) errors.push(diagnostic("provenance", "STATE_PROVENANCE", "schemaVersion 1 must not contain provenance"));
  if (typeof state.slug !== "string") errors.push(diagnostic("slug", "STATE_SLUG", "slug must be a string"));
  if (!INTENTS.has(state.intent)) errors.push(diagnostic("intent", "STATE_INTENT", "intent must be clear or unclear"));
  if (!DEPTHS.has(state.depth)) errors.push(diagnostic("depth", "STATE_DEPTH", "depth must be quick, standard, or architecture"));
  if (!STATUSES.has(state.status)) errors.push(diagnostic("status", "STATE_STATUS", "invalid lifecycle status"));
  if (!Number.isInteger(state.revision) || state.revision < 0) errors.push(diagnostic("revision", "STATE_REVISION", "revision must be a non-negative integer"));
  for (const key of ["components", "findings", "decisions", "assumptions", "todos", "commitStrategy", "successCriteria", "finalVerification"]) {
    if (!Array.isArray(state[key])) errors.push(diagnostic(key, "STATE_ARRAY", `${key} must be an array`));
  }
  if (!state.scope || typeof state.scope !== "object") errors.push(diagnostic("scope", "STATE_SCOPE", "scope must be an object"));
  if (!state.verification || typeof state.verification !== "object") errors.push(diagnostic("verification", "STATE_VERIFICATION", "verification must be an object"));
  if (!state.approvalBrief || typeof state.approvalBrief !== "object") errors.push(diagnostic("approvalBrief", "STATE_APPROVAL_BRIEF", "approvalBrief must be an object"));
  if (!state.review || typeof state.review !== "object" || !Array.isArray(state.review?.rounds)) errors.push(diagnostic("review", "STATE_REVIEW", "review.rounds must be an array"));
  rejectUnknown(state.summary, "summary", FIELD_SETS.summary, errors);
  if (Array.isArray(state.components)) state.components.forEach((item, index) => rejectUnknown(item, `components[${index}]`, FIELD_SETS.component, errors));
  if (Array.isArray(state.findings)) state.findings.forEach((item, index) => rejectUnknown(item, `findings[${index}]`, FIELD_SETS.finding, errors));
  if (Array.isArray(state.decisions)) state.decisions.forEach((item, index) => rejectUnknown(item, `decisions[${index}]`, FIELD_SETS.decision, errors));
  if (Array.isArray(state.assumptions)) state.assumptions.forEach((item, index) => rejectUnknown(item, `assumptions[${index}]`, FIELD_SETS.assumption, errors));
  rejectUnknown(state.scope, "scope", FIELD_SETS.scope, errors);
  rejectUnknown(state.verification, "verification", FIELD_SETS.verification, errors);
  rejectUnknown(state.approvalBrief, "approvalBrief", FIELD_SETS.approvalBrief, errors);
  rejectUnknown(state.approval, "approval", FIELD_SETS.approval, errors);
  rejectUnknown(state.repository, "repository", FIELD_SETS.repository, errors);
  rejectUnknown(state.repository?.git, "repository.git", FIELD_SETS.git, errors);
  if (Array.isArray(state.repository?.packages)) state.repository.packages.forEach((item, index) => rejectUnknown(item, `repository.packages[${index}]`, FIELD_SETS.package, errors));
  rejectUnknown(state.review, "review", FIELD_SETS.review, errors);
  if (Array.isArray(state.review?.rounds)) state.review.rounds.forEach((round, index) => {
    rejectUnknown(round, `review.rounds[${index}]`, FIELD_SETS.round, errors);
    rejectUnknown(round?.planCritic, `review.rounds[${index}].planCritic`, FIELD_SETS.receipt, errors);
    rejectUnknown(round?.architectureVerifier, `review.rounds[${index}].architectureVerifier`, FIELD_SETS.receipt, errors);
  });
  rejectUnknown(state.review?.final, "review.final", FIELD_SETS.final, errors);
  rejectUnknown(state.generated, "generated", FIELD_SETS.generated, errors);
  if (Array.isArray(state.todos)) state.todos.forEach((todo, index) => errors.push(...validateTodo(todo, index)));
  return errors;
}

export function assertValidState(state) {
  const diagnostics = validateState(state);
  if (diagnostics.length > 0) {
    throw new CliError("state validation failed", {
      code: "STATE_INVALID",
      details: diagnostics.map((item) => `${item.path}: ${item.code}: ${item.message}`),
    });
  }
  return state;
}
