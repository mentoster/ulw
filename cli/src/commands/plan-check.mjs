import { parseOptions, requirePositional } from "../args.mjs";
import { checkGeneratedDrift } from "../plan/generated-drift.mjs";
import { validatePlanState } from "../plan/validate-plan.mjs";
import { loadState } from "../state/store.mjs";
import { output } from "./command-io.mjs";

async function handler(argv, io, runtimeContext) {
  const { positionals, options } = parseOptions(argv, { json: "boolean" });
  const slug = requirePositional(positionals, 0, "slug");
  const state = await loadState(runtimeContext, slug);
  const diagnostics = [...await validatePlanState(state, runtimeContext), ...await checkGeneratedDrift(runtimeContext, state)];
  const result = { ok: diagnostics.length === 0, slug, diagnostics };
  output(io, result, options.json);
  return result.ok ? 0 : 1;
}
export function register(registerCommand) { registerCommand("plan", "check", handler); }
