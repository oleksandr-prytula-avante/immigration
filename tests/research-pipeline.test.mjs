import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile, utimes, chmod } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { validateResearchResult } from "../immigration_research.mjs";
import { readValidCheckpoint, validateCountryResult } from "../scripts/research-with-codex.mjs";
import { assertResearchState, refreshResearchMetadata, saveResearchState } from "../scripts/research-state.mjs";

const document = JSON.parse(await readFile(new URL("../dashboard/data/all-countries.json", import.meta.url), "utf8"));
const countries = document.results.map(item => item.country);
const today = new Date().toISOString().slice(0, 10);
const fixture = () => structuredClone(document.results.find(item => item.country === "Uruguay").data);

test("both research generators reject uncited claims and missing PR evidence before saving", () => {
  for (const validate of [validateResearchResult, validateCountryResult]) {
    const data = fixture();
    data.researched_at = today;
    assert.doesNotThrow(() => validate("Uruguay", data, { researchDate: today }));
    assert.throws(() => validate("Uruguay", data, { researchDate: "2000-01-01" }), /researched_at/);
    data.languages.russian_or_ukrainian_practicality.source_ids = [];
    assert.throws(() => validate("Uruguay", data), /requires cited value evidence/);
    const noReview = fixture();
    delete noReview.digital_nomad_pr_transition;
    assert.throws(() => validate("Uruguay", noReview), /requires a PR review/);
    const noAvailability = fixture();
    for (const route of [...noAvailability.best_routes, ...noAvailability.rejected_routes]) delete route.availability;
    assert.throws(() => validate("Uruguay", noAvailability), /requires a cited availability review/);
  }
});

test("partial refresh preserves the full research date and recomputes PR coverage from records", () => {
  const state = structuredClone(document);
  const previousDate = state.meta.last_full_research_date;
  const removed = state.results.findIndex(item => item.country === "Uruguay");
  state.results.splice(removed, 1);
  refreshResearchMetadata(state, countries);
  assert.equal(state.meta.last_full_research_date, previousDate);
  assert.equal(state.meta.status, "in_progress");
  assert.equal(state.meta.completed_countries, 192);
  assert.ok(!state.meta.digital_nomad_pr_review.countries.includes("Uruguay"));
  assert.ok(!state.meta.digital_nomad_availability_review.countries.includes("Uruguay"));
  assert.equal(state.meta.digital_nomad_availability_review.route_count, 78);
  assert.equal(state.meta.digital_nomad_availability_review.reviewed_at, document.meta.digital_nomad_availability_review.reviewed_at);
  state.results.find(item => item.country === "Spain").data.digital_nomad_pr_transition = null;
  refreshResearchMetadata(state, countries);
  assert.equal(state.meta.digital_nomad_pr_review, undefined);
});

test("invalid state and failed serialization preserve the previous snapshot", async () => {
  for (const invalid of [null, [], {}, { results: {} }, { results: [null] }]) {
    assert.throws(() => assertResearchState(invalid), /Existing research JSON/);
  }
  const directory = await mkdtemp(path.join(os.tmpdir(), "research-state-"));
  try {
    const file = path.join(directory, "snapshot.json");
    const original = { results: [{ country: "Uruguay", status: "ok", data: fixture() }] };
    await saveResearchState(file, original);
    const broken = structuredClone(original);
    broken.circular = broken;
    await assert.rejects(saveResearchState(file, broken), /circular/i);
    assert.deepEqual(JSON.parse(await readFile(file, "utf8")), original);
    assert.deepEqual(await readdir(directory), ["snapshot.json"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("checkpoints cannot replace newer snapshots or reuse a previous research date", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "research-checkpoint-"));
  try {
    const file = path.join(directory, "uruguay.json");
    const data = fixture();
    data.researched_at = today;
    await writeFile(file, JSON.stringify(data));
    assert.equal((await readValidCheckpoint(file, "Uruguay"))?.country, "Uruguay");
    await utimes(file, 1, 1);
    assert.equal(await readValidCheckpoint(file, "Uruguay", 2000), null);
    data.researched_at = "2000-01-01";
    await writeFile(file, JSON.stringify(data));
    assert.equal(await readValidCheckpoint(file, "Uruguay"), null);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("CLI retries process failures, uses the requested snapshot and leaves an empty queue untouched", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "research-cli-"));
  try {
    const snapshot = path.join(directory, "custom-snapshot.json");
    const executable = path.join(directory, "codex");
    const data = fixture();
    data.researched_at = today;
    await writeFile(snapshot, JSON.stringify(document));
    await writeFile(path.join(directory, "response.json"), JSON.stringify(data));
    // Only this local stub is executed; the test never calls an AI service.
    await writeFile(executable, `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const dir = process.env.RESEARCH_TEST_DIRECTORY;
const counter = path.join(dir, 'attempts');
const attempt = fs.existsSync(counter) ? Number(fs.readFileSync(counter)) + 1 : 1;
fs.writeFileSync(counter, String(attempt));
if (attempt === 1) process.exit(1);
if (!process.argv.at(-1).includes(path.join(dir, 'custom-snapshot.json'))) process.exit(2);
fs.copyFileSync(path.join(dir, 'response.json'), process.argv[process.argv.indexOf('-o') + 1]);
`);
    await chmod(executable, 0o755);
    const options = {
      cwd: fileURLToPath(new URL("../", import.meta.url)),
      encoding: "utf8",
      env: { ...process.env, PATH: `${directory}${path.delimiter}${process.env.PATH}`, RESEARCH_TEST_DIRECTORY: directory }
    };
    const args = ["scripts/research-with-codex.mjs", "--country", "Uruguay", "--out", snapshot,
      "--run-dir", path.join(directory, "runs"), "--max-attempts", "2"];
    const run = spawnSync(process.execPath, [...args, "--force"], options);
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /attempt 2/);
    const saved = JSON.parse(await readFile(snapshot, "utf8"));
    assert.equal(saved.meta.last_full_research_date, document.meta.last_full_research_date);
    assert.equal(saved.meta.status, "complete");
    assert.equal(saved.results.find(item => item.country === "Uruguay").data.researched_at, today);
    const before = await readFile(snapshot, "utf8");
    const empty = spawnSync(process.execPath, [...args, "--only-unexplained-nulls"], options);
    assert.equal(empty.status, 0, empty.stderr);
    assert.match(empty.stdout, /No countries selected/);
    assert.equal(await readFile(snapshot, "utf8"), before);
    assert.equal(await readFile(path.join(directory, "attempts"), "utf8"), "2");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
