import { parseOptions, requirePositional } from "../args.mjs";
import { renderArtifacts } from "../plan/render-artifacts.mjs";
import { loadState } from "../state/store.mjs";
import { output } from "./command-io.mjs";

async function handler(argv, io, runtimeContext) {
  const { positionals, options } = parseOptions(argv, { json: "boolean" });
  const slug = requirePositional(positionals, 0, "slug");
  const state = await renderArtifacts(runtimeContext, await loadState(runtimeContext, slug));
  output(io, { slug, generated: state.generated }, options.json);
  return 0;
}
export function register(registerCommand) { registerCommand("plan", "render", handler); }
