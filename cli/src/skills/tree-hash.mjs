import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import { relative, sep } from "node:path";
import { CliError } from "../errors.mjs";

export async function hashFile(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

export async function hashTree(root) {
  const stat = await lstat(root).catch((error) => {
    if (error?.code === "ENOENT") return null;
    throw error;
  });
  if (!stat) return null;
  if (stat.isSymbolicLink()) throw new CliError(`skill tree contains a symlink: ${root}`, { code: "SKILL_TREE_SYMLINK" });
  const records = [];
  async function walk(current) {
    const entries = await readdir(current, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const path = `${current}${sep}${entry.name}`;
      const name = relative(root, path).split(sep).join("/");
      if (entry.isSymbolicLink()) throw new CliError(`skill tree contains a symlink: ${path}`, { code: "SKILL_TREE_SYMLINK" });
      if (entry.isDirectory()) {
        records.push(`d\0${name}\0`);
        await walk(path);
      } else if (entry.isFile()) {
        records.push(`f\0${name}\0${await hashFile(path)}\0`);
      }
    }
  }
  await walk(root);
  return createHash("sha256").update(records.join("")).digest("hex");
}
