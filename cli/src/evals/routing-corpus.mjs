import { readFile } from "node:fs/promises";
import { CliError } from "../errors.mjs";
import { FAMILY } from "../skills/constants.mjs";

const LANGUAGES = new Set(["ru", "en"]);
const KINDS = new Set(["positive", "sibling-collision", "neighbor", "ambiguous", "abstain"]);

function parseJsonLines(text, path) {
  const output = [];
  const lines = text.replaceAll("\r\n", "\n").split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;
    try { output.push(JSON.parse(line)); }
    catch { throw new CliError(`invalid JSONL at ${path}:${index + 1}`, { code: "EVAL_JSONL_INVALID" }); }
  }
  return output;
}

export async function loadRoutingCorpus(path) {
  return parseJsonLines(await readFile(path, "utf8"), path);
}

export async function loadRoutingThresholds(path) {
  let value;
  try { value = JSON.parse(await readFile(path, "utf8")); }
  catch { throw new CliError(`invalid thresholds JSON: ${path}`, { code: "EVAL_THRESHOLDS_INVALID" }); }
  const errors = [];
  if (value?.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  for (const [label, metric] of [
    ["overall.microF1", value?.overall?.microF1],
    ["overall.macroF1", value?.overall?.macroF1],
    ["languages.ru.f1", value?.languages?.ru?.f1],
    ["languages.en.f1", value?.languages?.en?.f1],
    ["skills.minimumPrecision", value?.skills?.minimumPrecision],
    ["skills.minimumRecall", value?.skills?.minimumRecall],
    ["maximumSiblingCollisionRate", value?.maximumSiblingCollisionRate],
    ["maximumExpectedNullFalsePositiveRate", value?.maximumExpectedNullFalsePositiveRate],
  ]) if (typeof metric !== "number" || metric < 0 || metric > 1) errors.push(`${label} must be a number between 0 and 1`);
  if (errors.length) throw new CliError("routing thresholds are invalid", { code: "EVAL_THRESHOLDS_INVALID", details: errors });
  return value;
}

export function validateRoutingCorpus(cases) {
  const errors = [];
  const ids = new Set();
  const counts = {
    total: cases.length,
    languages: { ru: 0, en: 0 },
    kinds: Object.fromEntries([...KINDS].map((kind) => [kind, 0])),
    positives: Object.fromEntries(FAMILY.map((skill) => [skill, { ru: 0, en: 0 }])),
    collisionGroups: {},
  };
  for (let index = 0; index < cases.length; index += 1) {
    const item = cases[index];
    const prefix = `case[${index}]`;
    if (!item || typeof item !== "object" || Array.isArray(item)) { errors.push(`${prefix} must be an object`); continue; }
    if (typeof item.id !== "string" || !item.id) errors.push(`${prefix}.id must be a non-empty string`);
    else if (ids.has(item.id)) errors.push(`duplicate case id: ${item.id}`);
    else ids.add(item.id);
    if (!LANGUAGES.has(item.language)) errors.push(`${prefix}.language must be ru or en`);
    else counts.languages[item.language] += 1;
    if (typeof item.prompt !== "string" || item.prompt.trim().length < 8) errors.push(`${prefix}.prompt is too short`);
    if (item.expectedSkill !== null && !FAMILY.includes(item.expectedSkill)) errors.push(`${prefix}.expectedSkill must be a bundled skill or null`);
    if (!KINDS.has(item.kind)) errors.push(`${prefix}.kind is invalid`);
    else counts.kinds[item.kind] += 1;
    if (item.collisionGroup !== null && typeof item.collisionGroup !== "string") errors.push(`${prefix}.collisionGroup must be a string or null`);
    if (item.kind === "positive") {
      if (!item.expectedSkill) errors.push(`${prefix}.positive requires expectedSkill`);
      else if (FAMILY.includes(item.expectedSkill) && LANGUAGES.has(item.language)) counts.positives[item.expectedSkill][item.language] += 1;
    }
    if (["sibling-collision", "neighbor"].includes(item.kind)) {
      if (!item.collisionGroup) errors.push(`${prefix}.${item.kind} requires collisionGroup`);
      else {
        counts.collisionGroups[item.collisionGroup] ??= { ru: 0, en: 0 };
        if (LANGUAGES.has(item.language)) counts.collisionGroups[item.collisionGroup][item.language] += 1;
      }
    }
  }
  if (cases.length < 80) errors.push("routing corpus must contain at least 80 cases");
  if (counts.languages.ru !== counts.languages.en) errors.push("routing corpus must be balanced between ru and en");
  for (const skill of FAMILY) {
    const positive = counts.positives[skill];
    if (positive.ru === 0 || positive.en === 0 || positive.ru !== positive.en) errors.push(`${skill} positive coverage must be non-zero and balanced by language`);
  }
  for (const [group, languageCounts] of Object.entries(counts.collisionGroups)) {
    if (languageCounts.ru === 0 || languageCounts.en === 0) errors.push(`collision group ${group} must be represented in both languages`);
  }
  return { ok: errors.length === 0, errors, counts };
}

export async function validateRoutingFiles({ corpusPath, thresholdsPath }) {
  const cases = await loadRoutingCorpus(corpusPath);
  const corpus = validateRoutingCorpus(cases);
  if (!corpus.ok) throw new CliError("routing corpus is invalid", { code: "EVAL_CORPUS_INVALID", details: corpus.errors });
  const thresholds = await loadRoutingThresholds(thresholdsPath);
  return { cases, corpus, thresholds };
}
