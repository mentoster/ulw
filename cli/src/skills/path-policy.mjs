import { lstat } from "node:fs/promises";
import { parse, relative, resolve, sep } from "node:path";
import { CliError } from "../errors.mjs";

export async function assertSkillsPathSafe(path) {
  const absolute = resolve(path);
  const root = parse(absolute).root;
  let current = root;
  for (const part of relative(root, absolute).split(sep).filter(Boolean)) {
    current = resolve(current, part);
    const stat = await lstat(current).catch((error) => {
      if (error?.code === "ENOENT") return null;
      throw error;
    });
    if (stat?.isSymbolicLink()) throw new CliError(`skill path contains a symlink: ${current}`, { code: "SKILL_PATH_SYMLINK" });
    if (stat === null) break;
  }
}
