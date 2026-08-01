import { readFile } from "node:fs/promises";
import { CliError } from "../errors.mjs";
import { FAMILY } from "../skills/constants.mjs";

function divide(numerator, denominator) { return denominator === 0 ? 0 : numerator / denominator; }
function f1(precision, recall) { return precision + recall === 0 ? 0 : 2 * precision * recall / (precision + recall); }

export async function loadRoutingResults(path) {
  const records = [];
  const lines = (await readFile(path, "utf8")).replaceAll("\r\n", "\n").split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;
    try { records.push(JSON.parse(line)); }
    catch { throw new CliError(`invalid result JSONL at ${path}:${index + 1}`, { code: "EVAL_RESULTS_INVALID" }); }
  }
  return records;
}

export function validateRoutingResults(records) {
  const errors = [];
  const ids = new Set();
  const indices = new Set();
  const sizes = new Set();
  for (const record of records) {
    if (record?.schemaVersion !== 1) errors.push(`${record?.id ?? "<unknown>"}: schemaVersion must be 1`);
    if (typeof record?.id !== "string" || !record.id) errors.push("result id must be a string");
    else if (ids.has(record.id)) errors.push(`duplicate result id: ${record.id}`);
    else ids.add(record.id);
    if (!Number.isInteger(record?.index) || record.index < 0) errors.push(`${record?.id}: index must be a non-negative integer`);
    else indices.add(record.index);
    if (!Number.isInteger(record?.corpusSize) || record.corpusSize < 1) errors.push(`${record?.id}: corpusSize must be a positive integer`);
    else sizes.add(record.corpusSize);
    if (!new Set(["ru", "en"]).has(record?.language)) errors.push(`${record?.id}: invalid language`);
    if (record?.expectedSkill !== null && !FAMILY.includes(record?.expectedSkill)) errors.push(`${record?.id}: invalid expectedSkill`);
    if (record?.selectedSkill !== null && !FAMILY.includes(record?.selectedSkill)) errors.push(`${record?.id}: invalid selectedSkill`);
    if (record?.runnerError !== null && typeof record?.runnerError !== "string") errors.push(`${record?.id}: runnerError must be string or null`);
  }
  if (sizes.size !== 1) errors.push("all results must use one corpusSize");
  const expectedSize = [...sizes][0];
  if (expectedSize !== records.length) errors.push(`expected ${expectedSize} results, got ${records.length}`);
  for (let index = 0; index < records.length; index += 1) if (!indices.has(index)) errors.push(`missing result index: ${index}`);
  return errors;
}

function classMetrics(records, skill) {
  let tp = 0; let fp = 0; let fn = 0;
  for (const item of records) {
    if (item.expectedSkill === skill && item.selectedSkill === skill) tp += 1;
    else {
      if (item.selectedSkill === skill) fp += 1;
      if (item.expectedSkill === skill) fn += 1;
    }
  }
  const precision = divide(tp, tp + fp);
  const recall = divide(tp, tp + fn);
  return { tp, fp, fn, precision, recall, f1: f1(precision, recall) };
}

function microMetrics(records) {
  const aggregate = FAMILY.map((skill) => classMetrics(records, skill)).reduce((sum, item) => ({ tp: sum.tp + item.tp, fp: sum.fp + item.fp, fn: sum.fn + item.fn }), { tp: 0, fp: 0, fn: 0 });
  const precision = divide(aggregate.tp, aggregate.tp + aggregate.fp);
  const recall = divide(aggregate.tp, aggregate.tp + aggregate.fn);
  return { ...aggregate, precision, recall, f1: f1(precision, recall) };
}

export function scoreRoutingResults(records, thresholds) {
  const validationErrors = validateRoutingResults(records);
  if (validationErrors.length) throw new CliError("routing results are invalid", { code: "EVAL_RESULTS_INVALID", details: validationErrors });
  const skills = Object.fromEntries(FAMILY.map((skill) => [skill, classMetrics(records, skill)]));
  const micro = microMetrics(records);
  const macroF1 = FAMILY.reduce((sum, skill) => sum + skills[skill].f1, 0) / FAMILY.length;
  const languages = Object.fromEntries(["ru", "en"].map((language) => [language, microMetrics(records.filter((item) => item.language === language))]));
  const siblingCases = records.filter((item) => item.kind === "sibling-collision");
  const siblingCollisions = siblingCases.filter((item) => item.selectedSkill !== null && item.selectedSkill !== item.expectedSkill).length;
  const expectedNull = records.filter((item) => item.expectedSkill === null);
  const nullFalsePositives = expectedNull.filter((item) => item.selectedSkill !== null).length;
  const report = {
    schemaVersion: 1,
    cases: records.length,
    runnerErrors: records.filter((item) => item.runnerError).length,
    overall: { micro, macroF1 },
    languages,
    skills,
    siblingCollisionRate: divide(siblingCollisions, siblingCases.length),
    expectedNullFalsePositiveRate: divide(nullFalsePositives, expectedNull.length),
  };
  const violations = [];
  if (report.runnerErrors > 0) violations.push(`${report.runnerErrors} runner error(s)`);
  if (micro.f1 < thresholds.overall.microF1) violations.push(`overall micro F1 ${micro.f1} < ${thresholds.overall.microF1}`);
  if (macroF1 < thresholds.overall.macroF1) violations.push(`overall macro F1 ${macroF1} < ${thresholds.overall.macroF1}`);
  for (const language of ["ru", "en"]) if (languages[language].f1 < thresholds.languages[language].f1) violations.push(`${language} F1 ${languages[language].f1} < ${thresholds.languages[language].f1}`);
  for (const skill of FAMILY) {
    if (skills[skill].precision < thresholds.skills.minimumPrecision) violations.push(`${skill} precision ${skills[skill].precision} < ${thresholds.skills.minimumPrecision}`);
    if (skills[skill].recall < thresholds.skills.minimumRecall) violations.push(`${skill} recall ${skills[skill].recall} < ${thresholds.skills.minimumRecall}`);
  }
  if (report.siblingCollisionRate > thresholds.maximumSiblingCollisionRate) violations.push(`sibling collision rate ${report.siblingCollisionRate} > ${thresholds.maximumSiblingCollisionRate}`);
  if (report.expectedNullFalsePositiveRate > thresholds.maximumExpectedNullFalsePositiveRate) violations.push(`expected-null false-positive rate ${report.expectedNullFalsePositiveRate} > ${thresholds.maximumExpectedNullFalsePositiveRate}`);
  return { passed: violations.length === 0, violations, report };
}
