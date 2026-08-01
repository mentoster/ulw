import { parseOptions, requirePositional } from "../args.mjs";
import { nextAction } from "../plan/next-action.mjs";
import { checkGeneratedDrift } from "../plan/generated-drift.mjs";
import { validatePlanState } from "../plan/validate-plan.mjs";
import { loadState } from "../state/store.mjs";
import { output } from "./command-io.mjs";

async function handler(argv, io, runtimeContext) {
  const { positionals, options } = parseOptions(argv, { json: "boolean" });
  const slug = requirePositional(positionals, 0, "slug");
  const state = await loadState(runtimeContext, slug);
  const result = nextAction(state, [...await validatePlanState(state, runtimeContext), ...await checkGeneratedDrift(runtimeContext, state)]);
  output(io, result, options.json);
  return result.blockingDiagnostics.length ? 1 : 0;
}
export function register(registerCommand) { registerCommand("plan", "next", handler); }
