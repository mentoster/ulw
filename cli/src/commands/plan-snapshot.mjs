import { parseOptions, requirePositional } from "../args.mjs";
import { createRepositorySnapshot } from "../repository/snapshot.mjs";
import { assertGeneratedClean } from "../plan/generated-drift.mjs";
import { loadState, mutateState } from "../state/store.mjs";
import { renderArtifacts } from "../plan/render-artifacts.mjs";
import { output } from "./command-io.mjs";

async function handler(argv, io, runtimeContext) {
  const { positionals, options } = parseOptions(argv, { json: "boolean" });
  const slug = requirePositional(positionals, 0, "slug");
  await assertGeneratedClean(runtimeContext, await loadState(runtimeContext, slug));
  let state = await mutateState(runtimeContext, slug, async (current) => {
    current.repository = await createRepositorySnapshot(runtimeContext.workspace);
    return current;
  });
  state = await renderArtifacts(runtimeContext, state);
  output(io, { slug, revision: state.revision, capturedAt: state.repository.capturedAt }, options.json);
  return 0;
}
export function register(registerCommand) { registerCommand("plan", "snapshot", handler); }
