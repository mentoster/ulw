import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveArtifactTarget } from "../cli/src/io/path-policy.mjs";

test("path policy rejects traversal outside .hermes", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "ulw-path-"));
  await assert.rejects(() => resolveArtifactTarget(workspace, "../outside"), /escapes allowed root/);
});

test("path policy rejects symlink components", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "ulw-path-"));
  await mkdir(join(workspace, ".hermes"));
  await symlink(tmpdir(), join(workspace, ".hermes", "ulw"), process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(() => resolveArtifactTarget(workspace, "ulw/example/state.json"), /symlink/);
});
