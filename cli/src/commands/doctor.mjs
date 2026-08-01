import { parseOptions } from "../args.mjs";
import { runDoctor } from "../doctor/run-doctor.mjs";
import { output } from "./command-io.mjs";

async function handler(argv, io, runtimeContext) {
  const { options } = parseOptions(argv, { json: "boolean" });
  const result = await runDoctor({ runtimeContext });
  output(io, result, options.json);
  return result.ok ? 0 : 1;
}
export function register(registerCommand) { registerCommand("doctor", "", handler); }
