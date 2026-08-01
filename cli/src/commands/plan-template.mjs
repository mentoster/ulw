import { parseOptions } from "../args.mjs";
import { displayPath } from "../config/runtime-context.mjs";
import { createSemanticInputTemplate } from "../plan/semantic-input-template.mjs";
import { output } from "./command-io.mjs";

async function handler(argv, io, runtimeContext) {
  const { options } = parseOptions(argv, { slug: "value", json: "boolean" });
  const slug = options.slug ?? "example";
  output(io, createSemanticInputTemplate({ artifactRoot: displayPath(runtimeContext, runtimeContext.artifactRoot), slug }), true);
  return 0;
}

export function register(registerCommand) { registerCommand("plan", "template", handler); }
