import { parseOptions } from "../args.mjs";
import { contextSummary } from "../config/runtime-context.mjs";
import { output } from "./command-io.mjs";

async function handler(argv, io, runtimeContext) {
  const { options } = parseOptions(argv, { json: "boolean" });
  output(io, { ok: true, ...contextSummary(runtimeContext) }, options.json);
  return 0;
}
export function register(registerCommand) { registerCommand("config", "show", handler); }
