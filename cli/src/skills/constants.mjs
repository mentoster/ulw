import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
export const FAMILY = Object.freeze(["ulw-plan", "ulw-execute", "ulw-review", "ulw-worktree", "ulw-finish"]);
export const STRICT_SINGLE_AGENT_FAMILY = Object.freeze(["ulw-execute", "ulw-review", "ulw-worktree", "ulw-finish"]);
export const FORBIDDEN_EXECUTION_TERMS = Object.freeze([
  "subagent", "delegate_task", "delegate", "delegated", "delegation", "worker", "multi-agent",
  "parallel-agent", "independent reviewer", "external reviewer",
]);
export const LEGACY_DIRECTORIES = Object.freeze([
  "software-development/using-superpowers",
  "software-development/brainstorming",
  "software-development/writing-plans",
  "software-development/plan",
  "executing-plans",
  "software-development/subagent-driven-development",
  "requesting-code-review",
  "verification-before-completion",
  "using-git-worktrees",
  "finishing-a-development-branch",
]);
export const DIRECT_REPLACEMENTS = Object.freeze({
  "using-superpowers": "ulw-plan",
  "writing-plans": "ulw-plan",
  "executing-plans": "ulw-execute",
  "subagent-driven-development": "ulw-execute",
  "requesting-code-review": "ulw-review",
  "verification-before-completion": "ulw-review",
  "using-git-worktrees": "ulw-worktree",
  "finishing-a-development-branch": "ulw-finish",
});
export const TARGETED_REPLACEMENTS = Object.freeze({
  "`brainstorming`": "`ulw-plan`",
  "**brainstorming**": "**ulw-plan**",
  "skill_view(\"brainstorming\")": "skill_view(\"ulw-plan\")",
  "skill_view('brainstorming')": "skill_view('ulw-plan')",
});
