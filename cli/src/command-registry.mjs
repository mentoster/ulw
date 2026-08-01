export const CLI_VERSION = "0.5.2";

export const COMMAND_GROUPS = Object.freeze({
  plan: {
    summary: "Create, update, validate, review, and finalize implementation plans",
    commands: ["init", "snapshot", "template", "import", "render", "check", "next", "approve", "migrate", "finalize"],
  },
  review: {
    summary: "Prepare and record the two mandatory read-only plan reviews",
    commands: ["prepare", "record", "status"],
  },
  skill: {
    summary: "Install, check, or deploy the bundled ULW skill family",
    commands: ["install", "update", "uninstall", "check", "deploy", "migrate-legacy", "rollback"],
  },
  eval: {
    summary: "Validate, run, and score provider-neutral ULW routing evaluations",
    commands: ["validate", "run", "score"],
  },
  config: {
    summary: "Initialize, inspect, and validate ULW host profiles and roots",
    commands: ["init", "show", "check"],
  },
  doctor: {
    summary: "Diagnose CLI, project state, and runtime skill installation",
    commands: [],
  },
});

export function renderHelp() {
  const groups = Object.entries(COMMAND_GROUPS)
    .map(([name, spec]) => `  ${name.padEnd(10)} ${spec.summary}`)
    .join("\n");
  return `ULW CLI ${CLI_VERSION}\n\nUsage:\n  ulw <group> <command> [options]\n  ulw doctor [options]\n\nGroups:\n${groups}\n\nGlobal runtime options:\n  --workspace <path>      Project workspace\n  --profile <name>        Built-in profile (legacy or project-local)\n  --config <path>         Explicit profile/config JSON\n  --artifact-root <path>  Override generated artifact root\n  --skills-root <path>    Override installed skill root\n\nOther options:\n  --help                  Show help\n  --version               Show version\n`;
}

export function renderGroupHelp(group) {
  const spec = COMMAND_GROUPS[group];
  if (!spec) return renderHelp();
  const commands = spec.commands.length > 0 ? spec.commands.map((name) => `  ${name}`).join("\n") : "  (direct command)";
  return `${group}: ${spec.summary}\n\nCommands:\n${commands}\n`;
}

export function renderMarkdownCommandTable() {
  const rows = Object.entries(COMMAND_GROUPS).map(([group, spec]) => {
    const commands = spec.commands.length > 0
      ? spec.commands.map((command) => `\`ulw ${group} ${command}\``).join(", ")
      : "`ulw doctor`";
    return `| ${group} | ${commands} |`;
  });
  return ["| Group | Commands |", "| --- | --- |", ...rows].join("\n");
}
