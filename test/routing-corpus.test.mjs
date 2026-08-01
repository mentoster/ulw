import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { loadRoutingCorpus, loadRoutingThresholds, validateRoutingCorpus } from "../cli/src/evals/routing-corpus.mjs";

test("routing corpus is bilingual, balanced, unique, and complete", async () => {
  const cases = await loadRoutingCorpus("evals/routing/cases.jsonl");
  const validation = validateRoutingCorpus(cases);
  assert.deepEqual(validation.errors, []);
  assert.equal(validation.counts.total, 80);
  assert.equal(validation.counts.languages.ru, 40);
  assert.equal(validation.counts.languages.en, 40);
  for (const counts of Object.values(validation.counts.positives)) assert.deepEqual(counts, { ru: 4, en: 4 });
});

test("routing corpus rejects duplicate ids, imbalance, and invalid skills", async () => {
  const cases = await loadRoutingCorpus("evals/routing/cases.jsonl");
  const duplicate = structuredClone(cases);
  duplicate[1].id = duplicate[0].id;
  duplicate[2].language = "en";
  duplicate[3].expectedSkill = "unknown";
  const errors = validateRoutingCorpus(duplicate).errors.join("\n");
  assert.match(errors, /duplicate case id/);
  assert.match(errors, /balanced between ru and en/);
  assert.match(errors, /expectedSkill/);
});

test("committed routing thresholds match the release contract", async () => {
  const thresholds = await loadRoutingThresholds("evals/routing/thresholds.json");
  assert.equal(thresholds.overall.microF1, 0.9);
  assert.equal(thresholds.overall.macroF1, 0.9);
  assert.equal(thresholds.languages.ru.f1, 0.88);
  assert.equal(thresholds.languages.en.f1, 0.88);
  assert.equal(thresholds.skills.minimumPrecision, 0.85);
  assert.equal(thresholds.skills.minimumRecall, 0.85);
  assert.equal(thresholds.maximumSiblingCollisionRate, 0.05);
  assert.equal(thresholds.maximumExpectedNullFalsePositiveRate, 0.1);
  assert.match(await readFile("evals/routing/README.md", "utf8"), /not evidence of a\s+real model/);
});
