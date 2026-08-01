import { spawn } from "node:child_process";
import { extname, resolve } from "node:path";
import { FAMILY } from "../skills/constants.mjs";

function invocation(runner) {
  const path = resolve(runner);
  return [".mjs", ".js", ".cjs"].includes(extname(path))
    ? { command: process.execPath, args: [path] }
    : { command: path, args: [] };
}

export async function runRoutingCase(item, { runner, timeoutMs = 10000 } = {}) {
  const { command, args } = invocation(runner);
  const input = JSON.stringify({ id: item.id, language: item.language, prompt: item.prompt, availableSkills: FAMILY });
  return new Promise((resolveResult) => {
    const child = spawn(command, args, { shell: false, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveResult(value);
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish({ selectedSkill: null, runnerError: `runner timed out after ${timeoutMs}ms` });
    }, timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; if (stdout.length > 65536) child.kill("SIGKILL"); });
    child.stderr.on("data", (chunk) => { stderr += chunk; if (stderr.length > 65536) child.kill("SIGKILL"); });
    child.on("error", (error) => finish({ selectedSkill: null, runnerError: error.message }));
    child.on("close", (code) => {
      if (settled) return;
      if (code !== 0) return finish({ selectedSkill: null, runnerError: `runner exited ${code}: ${stderr.trim()}` });
      let parsed;
      try { parsed = JSON.parse(stdout.trim()); }
      catch { return finish({ selectedSkill: null, runnerError: "runner output is not one JSON object" }); }
      const selectedSkill = parsed?.selectedSkill;
      if (selectedSkill !== null && !FAMILY.includes(selectedSkill)) return finish({ selectedSkill: null, runnerError: `runner selected unknown skill: ${selectedSkill}` });
      finish({ selectedSkill, runnerError: null });
    });
    child.stdin.end(`${input}\n`);
  });
}

export async function runRoutingCorpus(cases, options) {
  const results = [];
  for (let index = 0; index < cases.length; index += 1) {
    const item = cases[index];
    const outcome = await runRoutingCase(item, options);
    results.push({
      schemaVersion: 1,
      index,
      corpusSize: cases.length,
      id: item.id,
      language: item.language,
      kind: item.kind,
      collisionGroup: item.collisionGroup,
      expectedSkill: item.expectedSkill,
      selectedSkill: outcome.selectedSkill,
      runnerError: outcome.runnerError,
    });
  }
  return results;
}
