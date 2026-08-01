import { CLI_VERSION } from "../command-registry.mjs";

export function createDefaultState({ slug, intent, depth, repository, profile = "legacy", artifactRoot = ".hermes", now = new Date().toISOString() }) {
  return {
    schemaVersion: 2,
    provenance: {
      createdByCliVersion: CLI_VERSION,
      migratedByCliVersion: null,
      profile,
      artifactRoot,
    },
    slug,
    intent,
    depth,
    status: "drafting",
    revision: 0,
    createdAt: now,
    updatedAt: now,
    approval: null,
    repository,
    summary: {
      whatYouGet: "",
      whyThisApproach: "",
      whatItWillNotDo: [],
      effort: "",
      risk: "",
      decisionsToCheck: [],
    },
    components: [],
    findings: [],
    decisions: [],
    assumptions: [],
    scope: { mustHave: [], mustNotHave: [], preserve: [], migrationRollback: [] },
    verification: { testDecision: "", commands: [], evidenceRoot: `${artifactRoot}/evidence/${slug}/`, misleadingSuccess: [] },
    approvalBrief: { confirmedFacts: [], approach: "", alternatives: [], scopeSummary: "", ownerDecisions: [], testStrategy: "" },
    todos: [],
    review: { maxRounds: 3, currentRound: 0, rounds: [], final: null },
    generated: { sourceStateSha256: null, draftSha256: null, planSha256: null },
    commitStrategy: [],
    successCriteria: [],
    finalVerification: [],
  };
}
