import { CliError } from "./errors.mjs";

export function parseOptions(argv, specification = {}) {
  const positionals = [];
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) {
      positionals.push(value);
      continue;
    }
    const name = value.slice(2);
    const rule = specification[name];
    if (!rule) throw new CliError(`unknown option: --${name}`, { code: "CLI_UNKNOWN_OPTION" });
    if (rule === "boolean") {
      options[name] = true;
      continue;
    }
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      throw new CliError(`option --${name} requires a value`, { code: "CLI_MISSING_OPTION_VALUE" });
    }
    options[name] = next;
    index += 1;
  }
  return { positionals, options };
}

export function requirePositional(positionals, index, label) {
  const value = positionals[index];
  if (!value) throw new CliError(`missing required argument: ${label}`, { code: "CLI_MISSING_ARGUMENT" });
  return value;
}
