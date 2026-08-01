import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseOptions, requirePositional } from "../args.mjs";
import { CliError } from "../errors.mjs";
import { atomicWriteFile, atomicWriteJson } from "../io/atomic-write.mjs";
import { resolveArtifactTarget } from "../io/path-policy.mjs";
import { assertGeneratedClean } from "../plan/generated-drift.mjs";
import { renderArtifacts } from "../plan/render-artifacts.mjs";
import { reviewContentSha256 } from "../plan/render-plan.mjs";
import { parseReviewResult } from "../review/parse-result.mjs";
import { applyReceipt, currentReviewRound, receiptKey } from "../review/review-state.mjs";
import { assertCurrentStateVersion, loadState, mutateState } from "../state/store.mjs";
import { output } from "./command-io.mjs";

async function handler(argv, io, runtimeContext) {
  const { positionals, options } = parseOptions(argv, { role: "value", file: "value", json: "boolean" });
  const slug = requirePositional(positionals, 0, "slug");
  if (!options.role || !options.file) throw new CliError("--role and --file are required", { code: "REVIEW_RECORD_OPTIONS" });
  const state = await loadState(runtimeContext, slug);
  assertCurrentStateVersion(state);
  await assertGeneratedClean(runtimeContext, state);
  const round = currentReviewRound(state);
  if (!round) throw new CliError("no current review round", { code: "REVIEW_NOT_PREPARED" });
  if (reviewContentSha256(state) !== round.reviewContentSha256) throw new CliError("plan changed after review preparation", { code: "REVIEW_STALE_PLAN" });
  const raw = await readFile(resolve(runtimeContext.workspace, options.file), "utf8").catch(() => { throw new CliError(`review result file not found: ${options.file}`, { code: "REVIEW_RESULT_FILE" }); });
  const parsed = parseReviewResult(raw, { role: options.role, round: round.round, reviewContentSha256: round.reviewContentSha256 });
  applyReceipt(structuredClone(state), parsed);
  const existingReceipt = round[receiptKey(options.role)];
  if (existingReceipt) {
    output(io, { slug, round: round.round, role: options.role, verdict: existingReceipt.verdict, status: state.status, resumed: true }, options.json);
    return 0;
  }
  const reviewDir = await resolveArtifactTarget(runtimeContext, join("ulw", slug, "reviews", `round-${round.round}`));
  await atomicWriteFile(join(reviewDir, `${options.role}.result.txt`), raw);
  await atomicWriteJson(join(reviewDir, `${options.role}.result.json`), parsed);
  let next = await mutateState(runtimeContext, slug, (candidate) => applyReceipt(candidate, parsed), { checkpoint: "recorded-review" });
  next = await renderArtifacts(runtimeContext, next);
  output(io, { slug, round: round.round, role: options.role, verdict: parsed.verdict, status: next.status }, options.json);
  return 0;
}
export function register(registerCommand) { registerCommand("review", "record", handler); }
