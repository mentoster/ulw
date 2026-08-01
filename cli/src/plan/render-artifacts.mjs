import { join } from "node:path";
import { atomicWriteFile } from "../io/atomic-write.mjs";
import { resolveArtifactTarget } from "../io/path-policy.mjs";
import { assertCurrentStateVersion, sha256, writeGeneratedState } from "../state/store.mjs";
import { renderDraft } from "./render-draft.mjs";
import { renderPlan, semanticPlanSha256 } from "./render-plan.mjs";

export async function renderArtifacts(workspace, state) {
  assertCurrentStateVersion(state);
  const sourceStateSha256 = semanticPlanSha256(state);
  const draft = renderDraft(state, { sourceStateSha256 });
  const plan = renderPlan(state);
  const draftPath = await resolveArtifactTarget(workspace, join("drafts", `${state.slug}.md`));
  const planPath = await resolveArtifactTarget(workspace, join("plans", `${state.slug}.md`));
  await atomicWriteFile(draftPath, draft);
  await atomicWriteFile(planPath, plan);
  const next = structuredClone(state);
  next.generated = {
    sourceStateSha256,
    draftSha256: sha256(draft),
    planSha256: sha256(plan),
  };
  return writeGeneratedState(workspace, next);
}
