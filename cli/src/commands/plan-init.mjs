import { parseOptions, requirePositional } from "../args.mjs";
import { displayArtifactPath } from "../config/runtime-context.mjs";
import { CliError } from "../errors.mjs";
import { assertSlug } from "../io/path-policy.mjs";
import { createRepositorySnapshot } from "../repository/snapshot.mjs";
import { createDefaultState } from "../state/default-state.mjs";
import { createState, loadState } from "../state/store.mjs";
import { renderArtifacts } from "../plan/render-artifacts.mjs";
import { output } from "./command-io.mjs";

async function handler(argv, io, runtimeContext) {
  const { positionals, options } = parseOptions(argv, { intent: "value", depth: "value", json: "boolean" });
  const slug = requirePositional(positionals, 0, "slug");
  assertSlug(slug);
  if (!['clear', 'unclear'].includes(options.intent)) throw new CliError("--intent must be clear or unclear", { code: "PLAN_INIT_INTENT" });
  if (!['quick', 'standard', 'architecture'].includes(options.depth)) throw new CliError("--depth must be quick, standard, or architecture", { code: "PLAN_INIT_DEPTH" });
  const existing = await loadState(runtimeContext, slug).catch((error) => {
    if (error?.code === "STATE_NOT_FOUND") return null;
    throw error;
  });
  if (existing) {
    if (existing.intent !== options.intent || existing.depth !== options.depth) throw new CliError("existing plan state uses different intent or depth", { code: "PLAN_INIT_CONFLICT" });
    output(io, { slug, status: existing.status, statePath: displayArtifactPath(runtimeContext, "ulw", slug, "state.json"), resumed: true }, options.json);
    return 0;
  }
  const repository = await createRepositorySnapshot(runtimeContext.workspace);
  let state = await createState(runtimeContext, createDefaultState({ slug, intent: options.intent, depth: options.depth, repository, profile: runtimeContext.profile, artifactRoot: runtimeContext.artifactRootSetting }));
  state = await renderArtifacts(runtimeContext, state);
  output(io, { slug, status: state.status, statePath: displayArtifactPath(runtimeContext, "ulw", slug, "state.json") }, options.json);
  return 0;
}

export function register(registerCommand) { registerCommand("plan", "init", handler); }
