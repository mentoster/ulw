import { CliError } from "../errors.mjs";

const VERDICTS = new Set(["APPROVE", "CHANGES_REQUIRED", "BLOCKED"]);
const ROLE_LABELS = {
  "plan-critic": "Plan critic",
  "architecture-verifier": "Architecture verifier",
};

function lineValue(lines, prefix) {
  const line = lines.find((item) => item.startsWith(`${prefix}:`));
  return line ? line.slice(prefix.length + 1).trim() : null;
}

export function parseReviewResult(text, expected) {
  const lines = text.replaceAll("\r\n", "\n").split("\n");
  const allowedHeaders = new Set(["ROLE", "VERDICT", "REVIEW_ROUND", "REVIEW_CONTENT_SHA256", "SUMMARY"]);
  const allowedFindingFields = new Set(["ID", "SEVERITY", "PLAN_LOCATION", "EVIDENCE", "PROBLEM", "REQUIRED_CORRECTION"]);
  const role = lineValue(lines, "ROLE");
  const verdict = lineValue(lines, "VERDICT");
  const roundRaw = lineValue(lines, "REVIEW_ROUND");
  const digest = lineValue(lines, "REVIEW_CONTENT_SHA256");
  const summary = lineValue(lines, "SUMMARY");
  const required = { ROLE: role, VERDICT: verdict, REVIEW_ROUND: roundRaw, REVIEW_CONTENT_SHA256: digest, SUMMARY: summary };
  const missing = Object.entries(required).filter(([, value]) => !value).map(([key]) => key);
  if (missing.length) throw new CliError("review result is missing required fields", { code: "REVIEW_RESULT_MALFORMED", details: missing });
  if (role !== ROLE_LABELS[expected.role]) throw new CliError(`review role mismatch: ${role}`, { code: "REVIEW_ROLE_MISMATCH" });
  if (!VERDICTS.has(verdict)) throw new CliError(`invalid review verdict: ${verdict}`, { code: "REVIEW_VERDICT_INVALID" });
  const round = Number(roundRaw);
  if (!Number.isInteger(round) || round !== expected.round) throw new CliError(`review round mismatch: ${roundRaw}`, { code: "REVIEW_ROUND_MISMATCH" });
  if (digest !== expected.reviewContentSha256) throw new CliError("review digest mismatch", { code: "REVIEW_DIGEST_MISMATCH" });
  const findingsIndex = lines.indexOf("FINDINGS:");
  const unverifiedIndex = lines.indexOf("UNVERIFIED:");
  if (findingsIndex < 0 || unverifiedIndex < 0 || unverifiedIndex <= findingsIndex) {
    throw new CliError("review result requires FINDINGS and UNVERIFIED sections", { code: "REVIEW_RESULT_MALFORMED" });
  }
  for (const line of lines) {
    const match = line.match(/^\s*(?:-\s*)?([A-Z_]+):/);
    if (match && !allowedHeaders.has(match[1]) && !allowedFindingFields.has(match[1]) && !["FINDINGS", "UNVERIFIED"].includes(match[1])) {
      throw new CliError(`unknown review field: ${match[1]}`, { code: "REVIEW_UNKNOWN_FIELD" });
    }
  }
  for (const header of allowedHeaders) {
    const count = lines.filter((line) => line.startsWith(`${header}:`)).length;
    if (count !== 1) throw new CliError(`review field must appear exactly once: ${header}`, { code: "REVIEW_DUPLICATE_FIELD" });
  }
  const findingsText = lines.slice(findingsIndex + 1, unverifiedIndex).join("\n").trim();
  const unverifiedText = lines.slice(unverifiedIndex + 1).join("\n").trim();
  if (verdict === "APPROVE" && (findingsText !== "NONE" || unverifiedText !== "NONE")) throw new CliError("APPROVE requires FINDINGS and UNVERIFIED to be NONE", { code: "REVIEW_APPROVE_FINDINGS" });
  if (verdict !== "APPROVE") {
    const requiredFindingFields = ["ID:", "SEVERITY:", "PLAN_LOCATION:", "EVIDENCE:", "PROBLEM:", "REQUIRED_CORRECTION:"];
    const missingFindingFields = requiredFindingFields.filter((field) => !findingsText.includes(field));
    if (!findingsText || findingsText === "NONE" || missingFindingFields.length > 0) {
      throw new CliError("non-APPROVE result requires a complete structured finding", { code: "REVIEW_FINDINGS_REQUIRED", details: missingFindingFields });
    }
  }
  return { role: expected.role, roleLabel: role, verdict, round, reviewContentSha256: digest, summary, findingsText, unverifiedText };
}
