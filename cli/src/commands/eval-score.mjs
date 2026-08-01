import { resolve } from "node:path";
import { parseOptions } from "../args.mjs";
import { CliError } from "../errors.mjs";
import { loadRoutingThresholds } from "../evals/routing-corpus.mjs";
import { loadRoutingResults, scoreRoutingResults } from "../evals/routing-score.mjs";
import { output } from "./command-io.mjs";

async function handler(argv, io, runtimeContext) {
  const { options } = parseOptions(argv, { results: "value", thresholds: "value", json: "boolean" });
  if (!options.results) throw new CliError("eval score requires --results", { code: "CLI_MISSING_ARGUMENT" });
  const resultsPath = resolve(options.results);
  const thresholdsPath = resolve(options.thresholds ?? "evals/routing/thresholds.json");
  const result = scoreRoutingResults(await loadRoutingResults(resultsPath), await loadRoutingThresholds(thresholdsPath));
  output(io, { ok: result.passed, resultsPath, thresholdsPath, ...result }, options.json);
  return result.passed ? 0 : 1;
}
export function register(registerCommand) { registerCommand("eval", "score", handler); }
