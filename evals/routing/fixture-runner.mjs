#!/usr/bin/env node

let input = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) input += chunk;
const item = JSON.parse(input);
const prefixes = ["plan", "execute", "review", "worktree", "finish"];
let selectedSkill = null;
for (const prefix of prefixes) {
  if (item.id.startsWith(`${prefix}-`) || item.id.startsWith(`collision-${prefix}-`)) {
    selectedSkill = `ulw-${prefix}`;
    break;
  }
}
process.stdout.write(`${JSON.stringify({ selectedSkill })}\n`);
