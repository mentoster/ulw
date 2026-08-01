import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseOptions, requirePositional } from "../args.mjs";
import { CliError } from "../errors.mjs";
import { applyPlanInput } from "../plan/input-schema.mjs";
import { renderArtifacts } from "../plan/render-artifacts.mjs";
import { reviewContentSha256 } from "../plan/render-plan.mjs";
import { mutateState } from "../state/store.mjs";
import { output } from "./command-io.mjs";

async function handler(argv, io, runtimeContext) {
  const { positionals, options } = parseOptions(argv, { file: "value", json: "boolean" });
  const slug = requirePositional(positionals, 0, "slug");
  if (!options.file) throw new CliError("--file is required", { code: "PLAN_IMPORT_FILE" });
  let input;
  try { input = JSON.parse(await readFile(resolve(runtimeContext.workspace, options.file), "utf8")); }
  catch { throw new CliError(`cannot parse plan input JSON: ${options.file}`, { code: "PLAN_INPUT_JSON" }); }
  let invalidated = false;
  let state = await mutateState(runtimeContext, slug, (current) => {
    const beforeScope = JSON.stringify({ scope: current.scope, decisions: current.decisions });
    const next = applyPlanInput(current, input);
    const semanticChanged = reviewContentSha256(current) !== reviewContentSha256(next);
    if (current.approval && beforeScope !== JSON.stringify({ scope: next.scope, decisions: next.decisions })) {
      invalidated = true;
      next.approval = null;
      next.review = { ...current.review, final: null };
      next.status = input.readyForApproval ? "awaiting-approval" : "drafting";
    } else if (semanticChanged && current.review.rounds.length > 0) {
      invalidated = true;
      next.review = { ...current.review, final: null };
      next.status = current.approval ? "approved" : next.status;
    }
    if (current.status === "blocked" && current.review.currentRound >= current.review.maxRounds) next.status = "blocked";
    return next;
  });
  state = await renderArtifacts(runtimeContext, state);
  output(io, { slug, revision: state.revision, status: state.status, reviewInvalidated: invalidated }, options.json);
  return 0;
}
export function register(registerCommand) { registerCommand("plan", "import", handler); }
