import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const charts = ["evaluation-current.svg", "qwen-before-after.svg"];
const skills = ["ulw-plan", "ulw-execute", "ulw-review", "ulw-worktree", "ulw-finish"];

test("evaluation charts are reproducible from committed numeric data", async () => {
  const output = await mkdtemp(join(tmpdir(), "ulw-evaluation-assets-"));
  const result = spawnSync(process.execPath, ["tools/render-evaluation-assets.mjs", output], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  for (const chart of charts) {
    assert.equal(await readFile(join(output, chart), "utf8"), await readFile(join("assets", chart), "utf8"));
  }
});

test("publication evidence distinguishes deterministic and exploratory results", async () => {
  const data = JSON.parse(await readFile("evals/benchmarks/publication-summary.json", "utf8"));
  assert.equal(data.schemaVersion, 1);
  assert.deepEqual(data.currentGates.map(({ passed, total }) => [passed, total]), [[80, 80], [6, 6], [92, 92], [5, 5]]);
  assert.equal(data.qwenExploratory.model, "Qwen/Qwen3.6-27B-FP8");
  assert.equal(data.qwenExploratory.sampleSizePerCondition, 1);
  assert.deepEqual(data.qwenExploratory.outcomes.map(({ before, after }) => [before, after]), [[0, 1], [0, 1]]);
  assert.ok(data.qwenExploratory.limitations.some((line) => /not population estimates/i.test(line)));
});

test("all SVG assets include accessible titles and descriptions", async () => {
  const paths = [
    "assets/ulw-mark.svg",
    ...charts.map((chart) => `assets/${chart}`),
    ...skills.map((skill) => `${skill}/assets/icon.svg`),
  ];
  for (const path of paths) {
    const svg = await readFile(path, "utf8");
    assert.match(svg, /^<svg[^>]+role="img"[^>]+aria-labelledby="title desc"/);
    assert.match(svg, /<title id="title">[^<]+<\/title>/);
    assert.match(svg, /<desc id="desc">[^<]+<\/desc>/);
  }
});
