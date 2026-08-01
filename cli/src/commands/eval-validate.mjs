import { resolve } from "node:path";
import { parseOptions } from "../args.mjs";
import { validateRoutingFiles } from "../evals/routing-corpus.mjs";
import { output } from "./command-io.mjs";

async function handler(argv, io, runtimeContext) {
  const { options } = parseOptions(argv, { corpus: "value", thresholds: "value", json: "boolean" });
  const corpusPath = resolve(options.corpus ?? "evals/routing/cases.jsonl");
  const thresholdsPath = resolve(options.thresholds ?? "evals/routing/thresholds.json");
  const result = await validateRoutingFiles({ corpusPath, thresholdsPath });
  output(io, { ok: true, corpusPath, thresholdsPath, counts: result.corpus.counts, thresholds: result.thresholds }, options.json);
  return 0;
}
export function register(registerCommand) { registerCommand("eval", "validate", handler); }
