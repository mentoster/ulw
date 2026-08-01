import { COMMAND_GROUPS, CLI_VERSION, renderGroupHelp, renderHelp } from "./command-registry.mjs";
import { CliError, formatError } from "./errors.mjs";
import { resolveRuntimeContext } from "./config/runtime-context.mjs";

const handlers = new Map();
const commandModules = {
  "plan:init": "./commands/plan-init.mjs",
  "plan:snapshot": "./commands/plan-snapshot.mjs",
  "plan:template": "./commands/plan-template.mjs",
  "plan:import": "./commands/plan-import.mjs",
  "plan:render": "./commands/plan-render.mjs",
  "plan:check": "./commands/plan-check.mjs",
  "plan:next": "./commands/plan-next.mjs",
  "plan:approve": "./commands/plan-approve.mjs",
  "plan:migrate": "./commands/plan-migrate.mjs",
  "plan:finalize": "./commands/plan-finalize.mjs",
  "review:prepare": "./commands/review-prepare.mjs",
  "review:record": "./commands/review-record.mjs",
  "review:status": "./commands/review-status.mjs",
  "skill:check": "./commands/skill-check.mjs",
  "skill:deploy": "./commands/skill-deploy.mjs",
  "skill:install": "./commands/skill-install.mjs",
  "skill:update": "./commands/skill-update.mjs",
  "skill:uninstall": "./commands/skill-uninstall.mjs",
  "skill:migrate-legacy": "./commands/skill-migrate-legacy.mjs",
  "skill:rollback": "./commands/skill-rollback.mjs",
  "eval:validate": "./commands/eval-validate.mjs",
  "eval:run": "./commands/eval-run.mjs",
  "eval:score": "./commands/eval-score.mjs",
  "config:init": "./commands/config-init.mjs",
  "config:show": "./commands/config-show.mjs",
  "config:check": "./commands/config-check.mjs",
  "doctor:": "./commands/doctor.mjs",
};

const RUNTIME_OPTIONS = new Set(["workspace", "profile", "config", "artifact-root", "skills-root"]);

function extractRuntimeOptions(argv) {
  const commandArgs = [];
  const runtimeOptions = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--") || !RUNTIME_OPTIONS.has(value.slice(2))) {
      commandArgs.push(value);
      continue;
    }
    const key = value.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) throw new CliError(`option --${key} requires a value`, { code: "CLI_MISSING_OPTION_VALUE" });
    if (runtimeOptions[key] !== undefined) throw new CliError(`option --${key} may appear only once`, { code: "CLI_DUPLICATE_OPTION" });
    runtimeOptions[key] = next;
    index += 1;
  }
  return {
    commandArgs,
    runtimeOptions: {
      workspace: runtimeOptions.workspace,
      profile: runtimeOptions.profile,
      config: runtimeOptions.config,
      artifactRoot: runtimeOptions["artifact-root"],
      skillsRoot: runtimeOptions["skills-root"],
    },
  };
}

export function registerCommand(group, command, handler) {
  handlers.set(`${group}:${command ?? ""}`, handler);
}

async function loadHandler(key) {
  if (handlers.has(key)) return;
  const modulePath = commandModules[key];
  if (!modulePath) return;
  const module = await import(modulePath);
  module.register(registerCommand);
}

export async function runCli(argv, io = { stdout: process.stdout, stderr: process.stderr }) {
  try {
    if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
      io.stdout.write(renderHelp());
      return 0;
    }
    if (argv[0] === "--version" || argv[0] === "-V") {
      io.stdout.write(`${CLI_VERSION}\n`);
      return 0;
    }

    const group = argv[0];
    if (!Object.hasOwn(COMMAND_GROUPS, group)) {
      throw new CliError(`unknown command group: ${group}`, {
        code: "CLI_UNKNOWN_GROUP",
        details: ["Run `ulw --help` to list the supported groups."],
      });
    }
    if (argv[1] === "--help" || argv[1] === "-h") {
      io.stdout.write(renderGroupHelp(group));
      return 0;
    }

    const command = group === "doctor" ? "" : argv[1];
    if (group !== "doctor" && !command) {
      io.stdout.write(renderGroupHelp(group));
      return 0;
    }
    const key = `${group}:${command ?? ""}`;
    await loadHandler(key);
    const handler = handlers.get(key);
    if (!handler) {
      throw new CliError(`unknown ${group} command: ${command}`, {
        code: "CLI_UNKNOWN_COMMAND",
        details: [`Run \`ulw ${group} --help\` to list supported commands.`],
      });
    }
    const rawCommandArgs = group === "doctor" ? argv.slice(1) : argv.slice(2);
    const { commandArgs, runtimeOptions } = extractRuntimeOptions(rawCommandArgs);
    const runtimeContext = await resolveRuntimeContext(runtimeOptions);
    return await handler(commandArgs, io, runtimeContext);
  } catch (error) {
    const formatted = formatError(error);
    io.stderr.write(formatted.text);
    return formatted.exitCode;
  }
}
