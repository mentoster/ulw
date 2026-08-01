import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("CLI help lists the supported command groups", () => {
  const result = spawnSync(process.execPath, ["cli/bin/ulw.mjs", "--help"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  for (const group of ["plan", "review", "skill", "eval", "config", "doctor"]) assert.match(result.stdout, new RegExp(`^  ${group}\\s`, "m"));
  assert.equal((result.stdout.match(/^  (plan|review|skill|eval|config|doctor)\s/gm) ?? []).length, 6);
  for (const option of ["--workspace", "--profile", "--config", "--artifact-root", "--skills-root"]) assert.match(result.stdout, new RegExp(option));
});

test("config help exposes init show and check", () => {
  const result = spawnSync(process.execPath, ["cli/bin/ulw.mjs", "config", "--help"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  for (const command of ["init", "show", "check"]) assert.match(result.stdout, new RegExp(`^  ${command}$`, "m"));
});

test("plan help exposes semantic template and explicit state migration", () => {
  const result = spawnSync(process.execPath, ["cli/bin/ulw.mjs", "plan", "--help"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^  template$/m);
  assert.match(result.stdout, /^  migrate$/m);
});

test("eval help exposes validate run and score", () => {
  const result = spawnSync(process.execPath, ["cli/bin/ulw.mjs", "eval", "--help"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  for (const command of ["validate", "run", "score"]) assert.match(result.stdout, new RegExp(`^  ${command}$`, "m"));
});

test("CLI help rejects unknown command groups", () => {
  const result = spawnSync(process.execPath, ["cli/bin/ulw.mjs", "unknown-command"], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /CLI_UNKNOWN_GROUP/);
  assert.match(result.stderr, /ulw --help/);
});

test("skill help exposes the checked install command", () => {
  const result = spawnSync(process.execPath, ["cli/bin/ulw.mjs", "skill", "--help"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^  install$/m);
  assert.match(result.stdout, /^  update$/m);
  assert.match(result.stdout, /^  uninstall$/m);
  assert.match(result.stdout, /^  check$/m);
  assert.match(result.stdout, /^  deploy$/m);
  assert.match(result.stdout, /^  migrate-legacy$/m);
  assert.match(result.stdout, /^  rollback$/m);
});
