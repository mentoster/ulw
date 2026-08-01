import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRepositorySnapshot, isSecretLikePath } from "../cli/src/repository/snapshot.mjs";

test("repository snapshot captures allowlisted metadata and skips secrets", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "ulw-snapshot-"));
  await writeFile(join(workspace, "AGENTS.md"), "instructions");
  await writeFile(join(workspace, "package.json"), JSON.stringify({ name: "fixture", scripts: { test: "node --test" } }));
  await writeFile(join(workspace, ".env"), "SECRET=value");
  await writeFile(join(workspace, "access-token.json"), "secret");
  await mkdir(join(workspace, ".github", "workflows"), { recursive: true });
  await writeFile(join(workspace, ".github", "workflows", "ci.yml"), "name: CI");
  const snapshot = await createRepositorySnapshot(workspace, "2026-01-01T00:00:00.000Z");
  assert.deepEqual(snapshot.instructions, ["AGENTS.md"]);
  assert.equal(snapshot.packages[0].scripts.test, "node --test");
  assert.ok(!JSON.stringify(snapshot).includes("access-token"));
  assert.ok(!JSON.stringify(snapshot).includes("SECRET=value"));
  assert.deepEqual(snapshot.workflows, [".github/workflows/ci.yml"]);
});

test("secret path classifier covers common credential names", () => {
  for (const path of [".env.local", "auth.json", "private.key", "passwords.txt", "session-cookie.db"]) assert.equal(isSecretLikePath(path), true);
});
