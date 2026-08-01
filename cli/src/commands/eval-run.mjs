import { resolve } from "node:path";
import { atomicWriteFile } from "../io/atomic-write.mjs";
import { parseOptions } from "../args.mjs";
import { CliError } from "../errors.mjs";
import { loadRoutingCorpus, validateRoutingCorpus } from "../evals/routing-corpus.mjs";
import { runRoutingCorpus } from "../evals/routing-runner.mjs";
import { output } from "./command-io.mjs";

async function handler(argv, io, runtimeContext) {
  const { options } = parseOptions(argv, { corpus: "value", runner: "value", output: "value", "timeout-ms": "value", json: "boolean" });
  if (!options.runner) throw new CliError("eval run requires --runner", { code: "CLI_MISSING_ARGUMENT" });
  if (!options.output) throw new CliError("eval run requires --output", { code: "CLI_MISSING_ARGUMENT" });
  const corpusPath = resolve(options.corpus ?? "evals/routing/cases.jsonl");
  const outputPath = resolve(options.output);
  const cases = await loadRoutingCorpus(corpusPath);
  const validation = validateRoutingCorpus(cases);
  if (!validation.ok) throw new CliError("routing corpus is invalid", { code: "EVAL_CORPUS_INVALID", details: validation.errors });
  const timeoutMs = options["timeout-ms"] === undefined ? 10000 : Number(options["timeout-ms"]);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) throw new CliError("--timeout-ms must be a positive integer", { code: "CLI_OPTION_INVALID" });
  const results = await runRoutingCorpus(cases, { runner: options.runner, timeoutMs });
  await atomicWriteFile(outputPath, `${results.map((item) => JSON.stringify(item)).join("\n")}\n`);
  const runnerErrors = results.filter((item) => item.runnerError).length;
  output(io, { ok: runnerErrors === 0, corpusPath, outputPath, cases: results.length, runnerErrors }, options.json);
  return runnerErrors === 0 ? 0 : 1;
}
export function register(registerCommand) { registerCommand("eval", "run", handler); }
