#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dataPath = join(root, "evals", "benchmarks", "publication-summary.json");
const outputRoot = resolve(process.argv[2] ?? join(root, "assets"));
const data = JSON.parse(await readFile(dataPath, "utf8"));

function escapeXml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function currentGatesSvg() {
  const rows = data.currentGates.map((gate, index) => {
    const y = 132 + index * 82;
    const ratio = gate.total === 0 ? 0 : gate.passed / gate.total;
    const width = Math.round(560 * ratio);
    return `  <g transform="translate(0 ${y})">
    <text x="64" y="0" class="label">${escapeXml(gate.label)}</text>
    <text x="1136" y="0" class="score" text-anchor="end">${gate.passed}/${gate.total}</text>
    <rect x="64" y="18" width="1072" height="22" rx="11" class="track"/>
    <rect x="64" y="18" width="${Math.round(1072 * ratio)}" height="22" rx="11" class="bar"/>
    <text x="64" y="62" class="detail">${escapeXml(gate.detail)}</text>
  </g>`;
  }).join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="520" viewBox="0 0 1200 520" role="img" aria-labelledby="title desc">
  <title id="title">ULW current deterministic verification</title>
  <desc id="desc">Four complete verification bars: routing fixture 80 of 80, approval gate 6 of 6, local test suite 92 of 92, and bundled skills 5 of 5.</desc>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#0B1020"/><stop offset="1" stop-color="#121B33"/></linearGradient>
    <linearGradient id="bar" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#5EEAD4"/><stop offset="1" stop-color="#60A5FA"/></linearGradient>
    <style>.title{font:700 28px Inter,ui-sans-serif,system-ui,sans-serif;fill:#F8FAFC}.sub{font:400 15px Inter,ui-sans-serif,system-ui,sans-serif;fill:#94A3B8}.label{font:600 17px Inter,ui-sans-serif,system-ui,sans-serif;fill:#E2E8F0}.score{font:700 17px ui-monospace,SFMono-Regular,Consolas,monospace;fill:#A7F3D0}.detail{font:400 13px Inter,ui-sans-serif,system-ui,sans-serif;fill:#94A3B8}.track{fill:#26324B}.bar{fill:url(#bar)}</style>
  </defs>
  <rect width="1200" height="520" rx="28" fill="url(#bg)"/>
  <text x="64" y="58" class="title">Deterministic verification</text>
  <text x="64" y="86" class="sub">Recorded ${escapeXml(data.recordedAt)} · exact local verification commands</text>
${rows}
  <text x="1136" y="490" class="sub" text-anchor="end">Fixture scores verify the tooling, not general model quality.</text>
</svg>\n`;
}

function qwenSvg() {
  const cards = data.qwenExploratory.outcomes.map((outcome, index) => {
    const x = 64 + index * 548;
    const before = outcome.before === 1 ? "PASS" : "FAIL";
    const after = outcome.after === 1 ? "PASS" : "FAIL";
    return `  <g transform="translate(${x} 126)">
    <rect width="504" height="300" rx="22" class="card"/>
    <text x="28" y="44" class="cardTitle">${escapeXml(outcome.label)}</text>
    <text x="28" y="78" class="intervention">${escapeXml(outcome.intervention)}</text>
    <text x="28" y="132" class="phase">Before</text>
    <rect x="130" y="104" width="334" height="42" rx="12" class="before"/>
    <text x="447" y="132" class="statusDark" text-anchor="end">${before}</text>
    <text x="28" y="210" class="phase">After</text>
    <rect x="130" y="182" width="334" height="42" rx="12" class="after"/>
    <text x="447" y="210" class="statusLight" text-anchor="end">${after}</text>
    <text x="28" y="270" class="binary">binary observation · n=${data.qwenExploratory.sampleSizePerCondition} per condition</text>
  </g>`;
  }).join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="520" viewBox="0 0 1200 520" role="img" aria-labelledby="title desc">
  <title id="title">Qwen exploratory before and after outcomes</title>
  <desc id="desc">In one exploratory Qwen session per condition, the first semantic import changed from fail to pass after adding an exact plan template, and same-turn self-approval changed from not blocked to blocked after adding a host-issued one-time grant.</desc>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#07111E"/><stop offset="1" stop-color="#172554"/></linearGradient>
    <linearGradient id="after" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#34D399"/><stop offset="1" stop-color="#22D3EE"/></linearGradient>
    <style>.title{font:700 28px Inter,ui-sans-serif,system-ui,sans-serif;fill:#F8FAFC}.sub{font:400 15px Inter,ui-sans-serif,system-ui,sans-serif;fill:#A5B4FC}.card{fill:#111C35;stroke:#334155}.cardTitle{font:650 17px Inter,ui-sans-serif,system-ui,sans-serif;fill:#F8FAFC}.intervention{font:400 13px Inter,ui-sans-serif,system-ui,sans-serif;fill:#93C5FD}.phase{font:600 14px Inter,ui-sans-serif,system-ui,sans-serif;fill:#CBD5E1}.before{fill:#475569}.after{fill:url(#after)}.statusDark,.statusLight{font:800 14px ui-monospace,SFMono-Regular,Consolas,monospace}.statusDark{fill:#F8FAFC}.statusLight{fill:#062A2A}.binary{font:400 12px Inter,ui-sans-serif,system-ui,sans-serif;fill:#94A3B8}.note{font:400 13px Inter,ui-sans-serif,system-ui,sans-serif;fill:#94A3B8}</style>
  </defs>
  <rect width="1200" height="520" rx="28" fill="url(#bg)"/>
  <text x="64" y="58" class="title">Qwen exploratory outcomes</text>
  <text x="64" y="86" class="sub">${escapeXml(data.qwenExploratory.model)} · one live planning session per condition</text>
${cards}
  <text x="64" y="476" class="note">Small-sample evidence: binary observations, not a population estimate. Deterministic regression coverage is reported separately.</text>
</svg>\n`;
}

await mkdir(outputRoot, { recursive: true });
await writeFile(join(outputRoot, "evaluation-current.svg"), currentGatesSvg());
await writeFile(join(outputRoot, "qwen-before-after.svg"), qwenSvg());
process.stdout.write(`${outputRoot}\n`);
