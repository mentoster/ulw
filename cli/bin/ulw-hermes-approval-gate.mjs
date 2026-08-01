#!/usr/bin/env node
import { resolveRuntimeContext } from "../src/config/runtime-context.mjs";
import { handleHermesApprovalHook } from "../src/host/hermes-approval-hook.mjs";

let raw = "";
for await (const chunk of process.stdin) raw += chunk;

let payload;
try { payload = JSON.parse(raw || "{}"); }
catch { payload = {}; }

try {
  const workspace = typeof payload.cwd === "string" && payload.cwd ? payload.cwd : process.cwd();
  const runtimeContext = await resolveRuntimeContext({ workspace });
  const response = await handleHermesApprovalHook(payload, runtimeContext);
  process.stdout.write(`${JSON.stringify(response)}\n`);
} catch {
  const command = payload?.tool_input?.command ?? payload?.tool_input?.cmd ?? "";
  if (payload?.hook_event_name === "pre_tool_call" && /\bplan\s+approve\b/u.test(String(command))) {
    process.stdout.write(`${JSON.stringify({
      action: "block",
      message: "ULW approval gate failed closed while validating plan approval. Do not approve in this turn.",
    })}\n`);
  } else {
    process.stdout.write("{}\n");
  }
}
