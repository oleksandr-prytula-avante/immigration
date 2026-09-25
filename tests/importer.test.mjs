import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { normalizeResults } from "../dashboard/dataset-model.js";
import { parseArgs, replaceRoutes, replaceSources, upsertCountry } from "../scripts/import-to-supabase.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const document = JSON.parse(await readFile(path.join(root, "dashboard/data/all-countries.json"), "utf8"));

function queryRecorder() {
  return {
    queries: [],
    async query(sql, parameters = []) {
      const placeholders = [...sql.matchAll(/\$(\d+)/g)].map((match) => Number(match[1]));
      assert.equal(Math.max(...placeholders), parameters.length, "SQL placeholder count must match its bound values");
      this.queries.push({ sql, parameters });
      if (/returning id, url/i.test(sql)) {
        return { rows: Array.from({ length: parameters.length / 6 }, (_, index) => ({ id: index + 1, url: parameters[index * 6] })) };
      }
      return { rows: [{ id: 1 }] };
    }
  };
}

test("every stored dashboard projection agrees with the browser model", async () => {
  const rows = normalizeResults(document);
  for (const [index, item] of document.results.entries()) {
    const db = queryRecorder();
    await upsertCountry(db, item, "test-run");
    const { sql, parameters } = db.queries[0];
    const columns = sql.match(/insert into public\.countries\s*\(([^)]+)\)/)[1].split(",").map((column) => column.trim());
    const stored = Object.fromEntries(columns.map((column, index) => [column, parameters[index]]));
    const expected = rows[index];
    assert.deepEqual({
      country: stored.name,
      available: stored.dnv_available,
      income: stored.minimum_income_usd_monthly,
      tax: stored.top_tax_rate_percent,
      years: stored.years_to_citizenship,
      jusSoli: stored.jus_soli,
      sources: stored.source_count
    }, {
      country: expected.country,
      available: expected.valid,
      income: expected.income,
      tax: expected.tax,
      years: expected.citizenshipYears,
      jusSoli: expected.jusSoli,
      sources: expected.sourceCount
    }, item.country);
    assert.equal(stored.citizenship_track_strength, item.data.settlement_track.citizenship_track_strength);
    assert.deepEqual(JSON.parse(stored.data), item.data);
  }
});

test("route insertion preserves unknown values and batches all fields consistently", async () => {
  const db = queryRecorder();
  const route = structuredClone(document.results[0].data.rejected_routes[0]);
  route.minimum_monthly_income_usd.value = null;
  route.independent_application_possible = "uncertain";
  const count = await replaceRoutes(db, 42, { best_routes: [], rejected_routes: [route] });
  assert.equal(count, 1);
  assert.equal(db.queries[0].parameters[6], null);
  assert.equal(db.queries[0].parameters[8], null);
  assert.deepEqual(JSON.parse(db.queries[0].parameters[12]), route);
});

test("source insertion canonicalizes URLs and preserves each country's citation keys", async () => {
  const db = queryRecorder();
  const sources = [
    { id: "A", title: "First", url: "https://example.com/page/?utm_source=mail#section", accessed_at: "2026-08-15" },
    { id: "B", title: "Second", url: "https://example.com/second?z=2&a=1", accessed_at: "2026-08-15" }
  ];
  assert.equal(await replaceSources(db, 42, "test-run", sources), 2);
  assert.equal(db.queries[0].parameters[0], "https://example.com/page");
  assert.equal(db.queries[0].parameters[6], "https://example.com/second?a=1&z=2");
  assert.deepEqual(db.queries[1].parameters, [42, 1, "A", "test-run", 42, 2, "B", "test-run"]);
});

test("partial CLI import validates a subset without needing a database connection", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "immigration-import-test-"));
  try {
    const inputPath = path.join(directory, "partial.json");
    await writeFile(inputPath, JSON.stringify({ results: [document.results[0]] }));
    const valid = spawnSync(process.execPath, ["scripts/import-to-supabase.mjs", "--file", inputPath, "--allow-partial", "--validate-only"], { cwd: root, encoding: "utf8" });
    assert.equal(valid.status, 0, valid.stderr);
    assert.match(valid.stdout, /valid dataset: 1 countries; 1 ok/);
    const complete = spawnSync(process.execPath, ["scripts/import-to-supabase.mjs", "--file", inputPath, "--validate-only"], { cwd: root, encoding: "utf8" });
    assert.notEqual(complete.status, 0);
    assert.match(complete.stderr, /Expected 193 results, found 1/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("misspelled or incomplete import options fail rather than silently choosing defaults", () => {
  assert.deepEqual(parseArgs(["--allow-partial", "--file", "partial.json", "--validate-only"]), {
    allowPartial: true, file: "partial.json", validateOnly: true
  });
  assert.throws(() => parseArgs(["--file"]), /requires a path/);
  assert.throws(() => parseArgs(["--validateOnly"]), /Unknown argument/);
});
