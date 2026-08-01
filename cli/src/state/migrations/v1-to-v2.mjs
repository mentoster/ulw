import { CLI_VERSION } from "../../command-registry.mjs";

export function migrateV1ToV2(state, destinationContext) {
  const next = structuredClone(state);
  next.schemaVersion = 2;
  next.provenance = {
    createdByCliVersion: "unknown-pre-0.5.0",
    migratedByCliVersion: CLI_VERSION,
    profile: destinationContext.profile,
    artifactRoot: destinationContext.artifactRootSetting,
  };
  const oldEvidencePrefix = ".hermes/evidence/";
  if (next.verification?.evidenceRoot?.startsWith(oldEvidencePrefix)) {
    next.verification.evidenceRoot = `${destinationContext.artifactRootSetting}/evidence/${next.verification.evidenceRoot.slice(oldEvidencePrefix.length)}`;
  }
  const reviewInvalidated = Boolean(next.approval || next.review?.rounds?.length || next.review?.final);
  if (reviewInvalidated) {
    next.approval = null;
    next.review = { maxRounds: next.review.maxRounds, currentRound: 0, rounds: [], final: null };
    next.status = "awaiting-approval";
  }
  next.generated = { sourceStateSha256: null, draftSha256: null, planSha256: null };
  return { state: next, reviewInvalidated };
}
