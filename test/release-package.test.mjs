import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertReleasePreflight, normalizePackMetadata, sha256File, validatePackFiles } from "../scripts/package-release.mjs";

const validPack = [
  "package/package.json",
  "package/README.md",
  "package/EVALUATION.md",
  "package/CHANGELOG.md",
  "package/LICENSE.md",
  "package/THIRD_PARTY_NOTICES.md",
  "package/RELEASE.md",
  "package/cli/bin/ulw.mjs",
  "package/cli/bin/ulw-hermes-approval-gate.mjs",
  "package/evals/routing/cases.jsonl",
  "package/evals/benchmarks/publication-summary.json",
  "package/assets/ulw-mark.svg",
  "package/assets/evaluation-current.svg",
  "package/assets/qwen-before-after.svg",
  "package/tools/skills-ref-version.txt",
  "package/ulw-plan/SKILL.md",
  "package/ulw-plan/assets/icon.svg",
  "package/ulw-execute/SKILL.md",
  "package/ulw-execute/assets/icon.svg",
  "package/ulw-review/SKILL.md",
  "package/ulw-review/assets/icon.svg",
  "package/ulw-worktree/SKILL.md",
  "package/ulw-worktree/assets/icon.svg",
  "package/ulw-finish/SKILL.md",
  "package/ulw-finish/assets/icon.svg",
];

test("release preflight requires a clean exact version tag", () => {
  assert.equal(assertReleasePreflight({ status: "", tag: "v0.5.0", version: "0.5.0" }), "v0.5.0");
  assert.throws(() => assertReleasePreflight({ status: " M README.md", tag: "v0.5.0", version: "0.5.0" }), /clean Git worktree/);
  assert.throws(() => assertReleasePreflight({ status: "", tag: "v0.4.0", version: "0.5.0" }), /tag mismatch/);
});

test("release pack allowlist requires all skills and rejects leaks", () => {
  assert.deepEqual(validatePackFiles(validPack), validPack);
  assert.throws(() => validatePackFiles(validPack.filter((path) => path !== "package/ulw-plan/SKILL.md")), /missing packaged skill/);
  assert.throws(() => validatePackFiles(validPack.filter((path) => path !== "package/ulw-plan/assets/icon.svg")), /missing packaged skill icon/);
  assert.throws(() => validatePackFiles(validPack.filter((path) => path !== "package/assets/ulw-mark.svg")), /missing packaged ULW mark/);
  assert.throws(() => validatePackFiles([...validPack, "package/test/secret.test.mjs"]), /forbidden packaged path/);
  assert.throws(() => validatePackFiles([...validPack, "package/random.txt"]), /unexpected packaged path/);
});

test("release pack metadata accepts npm array and npm 12 keyed-object shapes", () => {
  const metadata = { filename: "ulw-cli-0.5.0.tgz", files: validPack.map((path) => ({ path: path.replace(/^package\//, "") })) };
  assert.equal(normalizePackMetadata([metadata]), metadata);
  assert.equal(normalizePackMetadata({ "ulw-cli": metadata }), metadata);
  assert.equal(normalizePackMetadata(metadata), metadata);
  assert.throws(() => normalizePackMetadata({}), /unsupported JSON shape/);
});

test("release checksum uses SHA-256 over exact bytes", async () => {
  const root = await mkdtemp(join(tmpdir(), "ulw-release-hash-"));
  const path = join(root, "artifact.tgz");
  await writeFile(path, "release bytes");
  assert.equal(await sha256File(path), "ff7a5e6429d2c8511521e4abf41cd54a3e525ef4a1f24f8d1c67ede9d17874dd");
});
