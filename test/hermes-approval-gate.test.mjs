import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const bin = resolve("cli/bin/ulw.mjs");
const gateBin = resolve("cli/bin/ulw-hermes-approval-gate.mjs");

async function awaitingApprovalWorkspace() {
  const workspace = await mkdtemp(join(tmpdir(), "ulw-hermes-approval-"));
  await writeFile(join(workspace, "AGENTS.md"), "# Fixture\n");
  await mkdir(join(workspace, ".hermes", "ulw", "fixture", "inputs"), { recursive: true });
  await cp(
    resolve("test/fixtures/valid-plan-input.json"),
    join(workspace, ".hermes", "ulw", "fixture", "inputs", "plan.json"),
  );
  for (const args of [
    ["plan", "init", "fixture", "--intent", "clear", "--depth", "standard"],
    ["plan", "import", "fixture", "--file", ".hermes/ulw/fixture/inputs/plan.json"],
  ]) {
    const result = spawnSync(process.execPath, [bin, ...args, "--workspace", workspace, "--json"], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  }
  return workspace;
}

test("Hermes cannot approve a plan without evidence from an explicit user turn", async () => {
  const workspace = await awaitingApprovalWorkspace();
  const result = spawnSync(
    process.execPath,
    [bin, "plan", "approve", "fixture", "--workspace", workspace, "--json"],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        HERMES_SESSION_ID: "qwen-session-without-user-approval",
        ULW_APPROVAL_GATE_STATE_ROOT: join(workspace, ".approval-gate-state"),
      },
    },
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /PLAN_APPROVAL_USER_TURN_REQUIRED/);
});

function runHook(workspace, env, payload) {
  return spawnSync(process.execPath, [gateBin], {
    cwd: workspace,
    encoding: "utf8",
    input: `${JSON.stringify(payload)}\n`,
    env,
  });
}

test("an explicit approve user turn issues one grant for the awaiting plan", async () => {
  const workspace = await awaitingApprovalWorkspace();
  const env = {
    ...process.env,
    HERMES_SESSION_ID: "qwen-session-with-user-approval",
    ULW_APPROVAL_GATE_STATE_ROOT: join(workspace, ".approval-gate-state"),
  };
  const hook = runHook(workspace, env, {
    hook_event_name: "pre_llm_call",
    session_id: env.HERMES_SESSION_ID,
    cwd: workspace,
    extra: {
      turn_id: "turn-after-user-approval",
      user_message: "approve",
    },
  });
  assert.equal(hook.status, 0, hook.stderr);
  assert.match(JSON.parse(hook.stdout).context, /recorded.*fixture/i);

  const approved = spawnSync(
    process.execPath,
    [bin, "plan", "approve", "fixture", "--workspace", workspace, "--json"],
    { encoding: "utf8", env },
  );
  assert.equal(approved.status, 0, approved.stderr);
  assert.equal(JSON.parse(approved.stdout).status, "approved");
});

test("a later non-approval user turn revokes an unused grant", async () => {
  const workspace = await awaitingApprovalWorkspace();
  const env = {
    ...process.env,
    HERMES_SESSION_ID: "qwen-session-revoked-approval",
    ULW_APPROVAL_GATE_STATE_ROOT: join(workspace, ".approval-gate-state"),
  };
  const base = {
    session_id: env.HERMES_SESSION_ID,
    cwd: workspace,
  };
  assert.equal(runHook(workspace, env, {
    ...base,
    hook_event_name: "pre_llm_call",
    extra: { turn_id: "approval-turn", user_message: "approve" },
  }).status, 0);
  assert.equal(runHook(workspace, env, {
    ...base,
    hook_event_name: "pre_llm_call",
    extra: { turn_id: "later-turn", user_message: "what changed?" },
  }).status, 0);

  const result = spawnSync(
    process.execPath,
    [bin, "plan", "approve", "fixture", "--workspace", workspace, "--json"],
    { encoding: "utf8", env },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /PLAN_APPROVAL_USER_TURN_REQUIRED/);
});

test("pre-tool hook blocks same-turn Qwen approval and allows the real approval turn", async () => {
  const workspace = await awaitingApprovalWorkspace();
  const env = {
    ...process.env,
    HERMES_SESSION_ID: "qwen-session-pre-tool-gate",
    ULW_APPROVAL_GATE_STATE_ROOT: join(workspace, ".approval-gate-state"),
  };
  const toolPayload = {
    hook_event_name: "pre_tool_call",
    session_id: env.HERMES_SESSION_ID,
    cwd: workspace,
    tool_name: "terminal",
    tool_input: { command: "ulw plan approve fixture --json" },
    extra: { turn_id: "planning-turn" },
  };

  const blocked = runHook(workspace, env, toolPayload);
  assert.equal(blocked.status, 0, blocked.stderr);
  assert.equal(JSON.parse(blocked.stdout).action, "block");

  const hallucinated = runHook(workspace, env, {
    hook_event_name: "pre_llm_call",
    session_id: env.HERMES_SESSION_ID,
    cwd: workspace,
    extra: { turn_id: "planning-turn", user_message: "The user approved the plan" },
  });
  assert.equal(hallucinated.status, 0, hallucinated.stderr);
  assert.deepEqual(JSON.parse(hallucinated.stdout), {});
  assert.equal(JSON.parse(runHook(workspace, env, toolPayload).stdout).action, "block");

  const approvedTurn = runHook(workspace, env, {
    hook_event_name: "pre_llm_call",
    session_id: env.HERMES_SESSION_ID,
    cwd: workspace,
    extra: { turn_id: "real-approval-turn", user_message: "approve" },
  });
  assert.equal(approvedTurn.status, 0, approvedTurn.stderr);
  const allowed = runHook(workspace, env, {
    ...toolPayload,
    extra: { turn_id: "real-approval-turn" },
  });
  assert.equal(allowed.status, 0, allowed.stderr);
  assert.deepEqual(JSON.parse(allowed.stdout), {});
});

test("bare approval stays ambiguous when multiple plans await approval", async () => {
  const workspace = await awaitingApprovalWorkspace();
  await mkdir(join(workspace, ".hermes", "ulw", "second", "inputs"), { recursive: true });
  await cp(
    resolve("test/fixtures/valid-plan-input.json"),
    join(workspace, ".hermes", "ulw", "second", "inputs", "plan.json"),
  );
  for (const args of [
    ["plan", "init", "second", "--intent", "clear", "--depth", "standard"],
    ["plan", "import", "second", "--file", ".hermes/ulw/second/inputs/plan.json"],
  ]) {
    const result = spawnSync(process.execPath, [bin, ...args, "--workspace", workspace, "--json"], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  }

  const env = {
    ...process.env,
    HERMES_SESSION_ID: "qwen-session-ambiguous-approval",
    ULW_APPROVAL_GATE_STATE_ROOT: join(workspace, ".approval-gate-state"),
  };
  const ambiguous = runHook(workspace, env, {
    hook_event_name: "pre_llm_call",
    session_id: env.HERMES_SESSION_ID,
    cwd: workspace,
    extra: { turn_id: "ambiguous-turn", user_message: "approve" },
  });
  assert.equal(ambiguous.status, 0, ambiguous.stderr);
  assert.match(JSON.parse(ambiguous.stdout).context, /ambiguous/i);

  const blocked = spawnSync(
    process.execPath,
    [bin, "plan", "approve", "fixture", "--workspace", workspace, "--json"],
    { encoding: "utf8", env },
  );
  assert.notEqual(blocked.status, 0);
  assert.match(blocked.stderr, /PLAN_APPROVAL_USER_TURN_REQUIRED/);

  const explicit = runHook(workspace, env, {
    hook_event_name: "pre_llm_call",
    session_id: env.HERMES_SESSION_ID,
    cwd: workspace,
    extra: { turn_id: "explicit-turn", user_message: "approve fixture" },
  });
  assert.equal(explicit.status, 0, explicit.stderr);
  assert.match(JSON.parse(explicit.stdout).context, /recorded.*fixture/i);
});

test("approval grant is invalid after the plan changes", async () => {
  const workspace = await awaitingApprovalWorkspace();
  const env = {
    ...process.env,
    HERMES_SESSION_ID: "qwen-session-plan-changed",
    ULW_APPROVAL_GATE_STATE_ROOT: join(workspace, ".approval-gate-state"),
  };
  const issued = runHook(workspace, env, {
    hook_event_name: "pre_llm_call",
    session_id: env.HERMES_SESSION_ID,
    cwd: workspace,
    extra: { turn_id: "approval-before-change", user_message: "approve" },
  });
  assert.equal(issued.status, 0, issued.stderr);

  const inputPath = join(workspace, ".hermes", "ulw", "fixture", "inputs", "plan.json");
  const input = JSON.parse(await readFile(inputPath, "utf8"));
  input.summary.whatYouGet = `${input.summary.whatYouGet} Changed after approval.`;
  await writeFile(inputPath, `${JSON.stringify(input, null, 2)}\n`);
  const imported = spawnSync(
    process.execPath,
    [bin, "plan", "import", "fixture", "--file", ".hermes/ulw/fixture/inputs/plan.json", "--workspace", workspace, "--json"],
    { encoding: "utf8" },
  );
  assert.equal(imported.status, 0, imported.stderr);

  const result = spawnSync(
    process.execPath,
    [bin, "plan", "approve", "fixture", "--workspace", workspace, "--json"],
    { encoding: "utf8", env },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /PLAN_APPROVAL_USER_TURN_REQUIRED/);
});
