import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { CliError } from "../errors.mjs";
import { FAMILY, packageRoot } from "./constants.mjs";

const execFileAsync = promisify(execFile);

export async function skillsRefRevision() {
  return (await readFile(join(packageRoot, "tools", "skills-ref-version.txt"), "utf8")).trim();
}

export function skillsRefInvocation(revision, skillPath) {
  return {
    command: "uvx",
    args: ["--from", `git+https://github.com/agentskills/agentskills@${revision}#subdirectory=skills-ref`, "skills-ref", "validate", skillPath],
  };
}

export async function validateOfficialSkills({ runner = execFileAsync, root = packageRoot } = {}) {
  const revision = await skillsRefRevision();
  const results = [];
  for (const skill of FAMILY) {
    const path = join(root, skill);
    const invocation = skillsRefInvocation(revision, path);
    try {
      const result = await runner(invocation.command, invocation.args, { encoding: "utf8", cwd: root, maxBuffer: 4 * 1024 * 1024 });
      results.push({ skill, ok: true, stdout: result.stdout?.trim() ?? "", stderr: result.stderr?.trim() ?? "" });
    } catch (error) {
      const stderr = error?.stderr?.trim?.() ?? error?.message ?? String(error);
      throw new CliError(`official skills-ref validation failed for ${skill}`, {
        code: error?.code === "ENOENT" ? "SKILLS_REF_UNAVAILABLE" : "SKILLS_REF_INVALID",
        details: [stderr, `Install uv/uvx and retry the pinned revision ${revision}.`],
      });
    }
  }
  return { revision, results };
}

async function main() {
  const result = await validateOfficialSkills();
  process.stdout.write(`${JSON.stringify({ ok: true, ...result }, null, 2)}\n`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    const details = error?.details?.length ? `\n${error.details.map((item) => `  - ${item}`).join("\n")}` : "";
    process.stderr.write(`ERROR [${error?.code ?? "SKILLS_REF_ERROR"}]: ${error?.message ?? String(error)}${details}\n`);
    process.exitCode = 1;
  });
}
