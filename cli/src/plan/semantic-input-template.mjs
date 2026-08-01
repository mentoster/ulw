export function createSemanticInputTemplate({ artifactRoot = ".hermes", slug = "example" } = {}) {
  return {
    summary: {
      whatYouGet: "Describe the concrete deliverable.",
      whyThisApproach: "Explain the selected architecture and why it fits the repository.",
      whatItWillNotDo: ["Name an explicit non-goal."],
      effort: "Small|Medium|Large with a short rationale.",
      risk: "Low|Medium|High with the main risk.",
      decisionsToCheck: [],
    },
    components: [
      {
        id: "component-id",
        outcome: "State the observable component outcome.",
        status: "planned",
        evidence: "README.md:1-2",
      },
    ],
    findings: [
      { text: "State one repository fact.", evidence: "README.md:1-2" },
    ],
    decisions: [
      {
        decision: "State one implementation decision.",
        rationale: "Explain why this decision follows from evidence.",
        owner: "agent-default",
        evidence: "README.md:1-2",
      },
    ],
    assumptions: [
      {
        assumption: "State one reversible assumption.",
        default: "State the chosen default.",
        rationale: "Explain why it is safe.",
        reversible: true,
        rollback: "Explain how to reverse it.",
      },
    ],
    scope: {
      mustHave: ["Required behavior."],
      mustNotHave: ["Forbidden adjacent behavior."],
      preserve: ["Existing behavior that must remain unchanged."],
      migrationRollback: ["Migration or rollback boundary."],
    },
    verification: {
      testDecision: "Explain the test strategy.",
      commands: ["npm test"],
      evidenceRoot: `${artifactRoot}/evidence/${slug}/`,
      misleadingSuccess: ["Name a result that could look successful but is insufficient."],
    },
    approvalBrief: {
      confirmedFacts: ["Fact with repository evidence."],
      approach: "Summarize the approach for the user.",
      alternatives: ["Alternative and why it was not selected."],
      scopeSummary: "Summarize included and excluded scope.",
      ownerDecisions: [],
      testStrategy: "Summarize happy and failure verification.",
    },
    todos: [
      {
        id: "T1",
        title: "Imperative todo title",
        component: "component-id",
        files: [{ action: "create", path: "src/example.js" }],
        whatToDo: "Describe the exact implementation work.",
        mustNotDo: "Describe the boundary for this todo.",
        dependsOn: [],
        blocks: [],
        references: ["README.md:1-2"],
        acceptance: "State an observable acceptance condition.",
        qaHappy: "State the happy-path command or workflow and expected result.",
        qaFailure: "State the failure-path command or workflow and expected rejection.",
        evidence: `${artifactRoot}/evidence/${slug}/t1.txt`,
        commit: "feat: describe the focused change",
      },
    ],
    commitStrategy: ["Keep implementation and its tests in the same focused commit."],
    successCriteria: ["State a measurable project-level success condition."],
    finalVerification: ["Run the complete project verification command."],
    readyForApproval: false,
  };
}
