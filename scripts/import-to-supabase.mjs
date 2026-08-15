import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { databaseUrl, loadLocalEnv } from "./db-env.mjs";
import { validateDatasetDocument } from "./validate-dataset.mjs";

const { Client } = pg;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
await loadLocalEnv(root);

const args = parseArgs(process.argv.slice(2));
const inputPath = path.resolve(root, args.file || "dashboard/data/all-countries.json");
const document = JSON.parse(await fs.readFile(inputPath, "utf8"));
const results = Array.isArray(document.results) ? document.results : [];
const expectedCountries = JSON.parse(
  await fs.readFile(path.join(root, "countries.un-members-193.json"), "utf8")
);

const validation = validateDatasetDocument(document, expectedCountries);
if (!validation.valid) {
  throw new Error(`Dataset validation failed:\n${validation.errors.join("\n")}`);
}

if (results.length !== 193 && !args.allowPartial) {
  throw new Error(`Expected 193 country results, found ${results.length}. Use --allow-partial to override.`);
}

const duplicateCountries = duplicates(results.map((item) => item.country));
if (duplicateCountries.length) {
  throw new Error(`Duplicate countries: ${duplicateCountries.join(", ")}`);
}

if (args.validateOnly) {
  const okCount = results.filter((item) => item.status === "ok").length;
  let routeCount = 0;
  let sourceCount = 0;
  const validationDb = {
    async query(sql, parameters = []) {
      const placeholders = [...sql.matchAll(/\$(\d+)/g)].map((match) => Number(match[1]));
      const expected = placeholders.length ? Math.max(...placeholders) : 0;
      if (expected !== parameters.length) {
        throw new Error(`SQL parameter mismatch: query expects ${expected}, received ${parameters.length}`);
      }
      return { rows: [{ id: 1 }] };
    }
  };

  for (const item of results) {
    const countryId = await upsertCountry(validationDb, item, "00000000-0000-0000-0000-000000000000");
    routeCount += await replaceRoutes(validationDb, countryId, item.data);
    sourceCount += await replaceSources(
      validationDb,
      countryId,
      "00000000-0000-0000-0000-000000000000",
      item.data?.sources
    );
    await insertSnapshot(
      validationDb,
      countryId,
      "00000000-0000-0000-0000-000000000000",
      item
    );
  }
  console.log(`valid dataset: ${results.length} countries; ${okCount} ok; ${routeCount} routes; ${sourceCount} source links`);
  process.exit(0);
}

const client = new Client({
  connectionString: databaseUrl(),
  ssl: sslOptions()
});

await client.connect();

try {
  await client.query("begin");
  const runId = await createRun(client, document, inputPath, results.length);

  let routeCount = 0;
  let sourceLinkCount = 0;

  for (const [index, item] of results.entries()) {
    const countryId = await upsertCountry(client, item, runId);
    await client.query("delete from public.routes where country_id = $1", [countryId]);
    await client.query("delete from public.country_sources where country_id = $1", [countryId]);

    routeCount += await replaceRoutes(client, countryId, item.data);
    sourceLinkCount += await replaceSources(client, countryId, runId, item.data?.sources);
    await insertSnapshot(client, countryId, runId, item);

    if ((index + 1) % 25 === 0 || index + 1 === results.length) {
      console.log(`imported ${index + 1}/${results.length}`);
    }
  }

  await client.query(
    "update public.research_runs set imported_country_count = $2 where id = $1",
    [runId, results.length]
  );
  await verifyImport(client, runId, {
    countries: results.length,
    routes: routeCount,
    sourceLinks: sourceLinkCount,
    snapshots: results.length
  });
  await client.query("commit");

  console.log(`run ${runId}`);
  console.log(`countries ${results.length}; routes ${routeCount}; source links ${sourceLinkCount}`);
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}

async function verifyImport(db, runId, expected) {
  const result = await db.query(
    `select
       (select count(*)::integer from public.countries where last_run_id = $1) as countries,
       (select count(*)::integer
          from public.routes r
          join public.countries c on c.id = r.country_id
         where c.last_run_id = $1) as routes,
       (select count(*)::integer from public.country_sources where run_id = $1) as source_links,
       (select count(*)::integer from public.country_snapshots where run_id = $1) as snapshots`,
    [runId]
  );
  const actual = result.rows[0];
  const mismatches = [
    ["countries", Number(actual.countries), expected.countries],
    ["routes", Number(actual.routes), expected.routes],
    ["source links", Number(actual.source_links), expected.sourceLinks],
    ["snapshots", Number(actual.snapshots), expected.snapshots]
  ].filter(([, value, expectedValue]) => value !== expectedValue);

  if (mismatches.length) {
    throw new Error(
      `Post-import verification failed: ${mismatches
        .map(([label, value, expectedValue]) => `${label}=${value}, expected ${expectedValue}`)
        .join("; ")}`
    );
  }
  console.log(
    `verified database: ${actual.countries} countries; ${actual.routes} routes; ` +
    `${actual.source_links} source links; ${actual.snapshots} snapshots`
  );
}

async function createRun(db, input, sourceFile, expectedCount) {
  const result = await db.query(
    `insert into public.research_runs
      (source_file, country_set, expected_country_count, source_updated_at, metadata)
     values ($1, $2, $3, $4, $5::jsonb)
     returning id`,
    [
      path.relative(root, sourceFile),
      input.meta?.country_set || "193 UN member states",
      expectedCount,
      validTimestamp(input.meta?.updated_at),
      JSON.stringify(input.meta || {})
    ]
  );
  return result.rows[0].id;
}

async function upsertCountry(db, item, runId) {
  const data = item.data || {};
  const bestRoute = (data.best_routes || []).find((route) => route?.valid_for_selection === true)
    || data.best_routes?.[0]
    || null;
  const sourceCount = Array.isArray(data.sources) ? data.sources.length : 0;
  const values = [
    item.country,
    item.status === "error" ? "error" : "ok",
    validDate(data.researched_at),
    selectionValue(data.valid_for_selection),
    data.fully_matched === true,
    booleanValue(data.dnv_available),
    jusSoliValue(data.child_citizenship),
    textValue(data.citizenship_track_strength),
    textValue(data.settlement_track?.classification),
    selectionValue(data.regular_foreign_contract_remote_work_fit?.value, true),
    numberValue(bestRoute?.minimum_monthly_income_usd),
    firstNumber(
      data.taxes?.taxation_system?.top_personal_income_tax_rate_percent,
      data.taxes?.digital_nomad_taxation?.top_or_screening_pit_rate_percent,
      data.taxes?.income_tax_rate_percent
    ),
    firstNumber(
      data.timeline?.total_years_to_citizenship,
      data.timeline?.years_to_citizenship,
      data.settlement_track?.years_to_citizenship
    ),
    integerValue(data.passport?.rank),
    integerValue(data.passport?.visa_free_destinations),
    firstNumber(
      data.labor_market?.average_citizen_salary?.average_salary_usd_monthly,
      data.labor_market?.average_wage_usd_monthly
    ),
    textValue(data.confidence),
    sourceCount,
    countUnresolved(data),
    textValue(data.selection_summary),
    JSON.stringify(data),
    runId
  ];

  const result = await db.query(
    `insert into public.countries (
       name, status, researched_at, valid_for_selection, fully_matched, dnv_available, jus_soli,
       citizenship_track_strength, settlement_classification, regular_remote_work_fit,
       minimum_income_usd_monthly, top_tax_rate_percent, years_to_citizenship,
       passport_rank, visa_free_destinations, average_salary_usd_monthly, confidence,
       source_count, unresolved_field_count, selection_summary, data, last_run_id
     ) values (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
       $17, $18, $19, $20, $21::jsonb, $22
     )
     on conflict (name) do update set
       status = excluded.status,
       researched_at = excluded.researched_at,
       valid_for_selection = excluded.valid_for_selection,
       fully_matched = excluded.fully_matched,
       dnv_available = excluded.dnv_available,
       jus_soli = excluded.jus_soli,
       citizenship_track_strength = excluded.citizenship_track_strength,
       settlement_classification = excluded.settlement_classification,
       regular_remote_work_fit = excluded.regular_remote_work_fit,
       minimum_income_usd_monthly = excluded.minimum_income_usd_monthly,
       top_tax_rate_percent = excluded.top_tax_rate_percent,
       years_to_citizenship = excluded.years_to_citizenship,
       passport_rank = excluded.passport_rank,
       visa_free_destinations = excluded.visa_free_destinations,
       average_salary_usd_monthly = excluded.average_salary_usd_monthly,
       confidence = excluded.confidence,
       source_count = excluded.source_count,
       unresolved_field_count = excluded.unresolved_field_count,
       selection_summary = excluded.selection_summary,
       data = excluded.data,
       last_run_id = excluded.last_run_id
     returning id`,
    values
  );
  return result.rows[0].id;
}

async function replaceRoutes(db, countryId, data) {
  let count = 0;
  for (const [kind, routes] of [
    ["best", data?.best_routes || []],
    ["rejected", data?.rejected_routes || []]
  ]) {
    for (const [ordinal, route] of routes.entries()) {
      await db.query(
        `insert into public.routes (
           country_id, route_kind, ordinal, route_name, route_type, valid_for_selection,
           independent_application_possible, local_employer_required,
           minimum_income_usd_monthly, application_url, application_url_type, confidence, data
         ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)`,
        [
          countryId,
          kind,
          ordinal,
          textValue(route?.route_name),
          textValue(route?.route_type || route?.status_type),
          selectionValue(route?.valid_for_selection, true),
          booleanValue(route?.independent_application_possible),
          booleanValue(route?.local_employer_required),
          numberValue(route?.minimum_monthly_income_usd),
          textValue(route?.application_url),
          textValue(route?.application_url_type),
          textValue(route?.confidence),
          JSON.stringify(route || {})
        ]
      );
      count += 1;
    }
  }
  return count;
}

async function replaceSources(db, countryId, runId, sources) {
  let count = 0;
  for (const [index, source] of (Array.isArray(sources) ? sources : []).entries()) {
    const url = textValue(source?.url);
    if (!url) continue;
    const result = await db.query(
      `insert into public.sources (url, title, publisher, source_type, accessed_at, data)
       values ($1, $2, $3, $4, $5, $6::jsonb)
       on conflict (url) do update set
         title = excluded.title,
         publisher = coalesce(excluded.publisher, public.sources.publisher),
         source_type = coalesce(excluded.source_type, public.sources.source_type),
         accessed_at = coalesce(excluded.accessed_at, public.sources.accessed_at),
         data = excluded.data
       returning id`,
      [
        url,
        textValue(source?.title) || url,
        textValue(source?.publisher),
        textValue(source?.source_type),
        validDate(source?.accessed_at || source?.access_date || source?.date_accessed || source?.last_accessed || source?.date),
        JSON.stringify(source || {})
      ]
    );
    await db.query(
      `insert into public.country_sources (country_id, source_id, source_key, run_id)
       values ($1, $2, $3, $4)
       on conflict (country_id, source_id, source_key) do update set run_id = excluded.run_id`,
      [countryId, result.rows[0].id, textValue(source?.id) || `source-${index + 1}`, runId]
    );
    count += 1;
  }
  return count;
}

async function insertSnapshot(db, countryId, runId, item) {
  await db.query(
    `insert into public.country_snapshots
      (country_id, run_id, status, started_at, finished_at, data, error)
     values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)`,
    [
      countryId,
      runId,
      item.status || "ok",
      validTimestamp(item.started_at),
      validTimestamp(item.finished_at),
      item.data ? JSON.stringify(item.data) : null,
      item.error ? JSON.stringify(item.error) : null
    ]
  );
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) parsed[key] = true;
    else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}

function selectionValue(value, nullable = false) {
  const raw = value?.value ?? value;
  if (raw === true || raw === "true") return "true";
  if (raw === false || raw === "false") return "false";
  if (raw === "partial" || raw === "uncertain") return raw;
  if (raw === "needs_manual_review") return "uncertain";
  return nullable ? null : "false";
}

function numberValue(value) {
  const raw = value?.value ?? value;
  if (raw === null || raw === undefined || raw === "") return null;
  const number = Number(raw);
  return Number.isFinite(number) ? number : null;
}

function integerValue(value) {
  const number = numberValue(value);
  return number === null ? null : Math.round(number);
}

function firstNumber(...values) {
  for (const value of values) {
    const number = numberValue(value);
    if (number !== null) return number;
  }
  return null;
}

function booleanValue(value) {
  const raw = value?.value ?? value;
  if (raw === true || raw === "true" || raw === "yes") return true;
  if (raw === false || raw === "false" || raw === "no") return false;
  return null;
}

function jusSoliValue(childCitizenship) {
  const explicit = booleanValue(childCitizenship?.jus_soli);
  if (explicit !== null) return explicit;
  const classification = childCitizenship?.birthright_citizenship?.value;
  if (!classification) return null;
  return classification === "unconditional_jus_soli";
}

function textValue(value) {
  const raw = value?.value ?? value;
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "object") return JSON.stringify(raw);
  return String(raw);
}

function validDate(value) {
  if (!value) return null;
  const match = String(value).match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : null;
}

function validTimestamp(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function countUnresolved(value) {
  const pattern = /\b(not[ _-]?found|not[ _-]?confirmed|no data|not researched|not_confirmed_in_dataset)\b/i;
  if (typeof value === "string") return pattern.test(value) ? 1 : 0;
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + countUnresolved(item), 0);
  if (value && typeof value === "object") {
    return Object.values(value).reduce((sum, item) => sum + countUnresolved(item), 0);
  }
  return 0;
}

function duplicates(values) {
  const seen = new Set();
  const repeated = new Set();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated];
}

function sslOptions() {
  if (process.env.PGSSLMODE === "disable") return false;
  return { rejectUnauthorized: process.env.PGSSL_REJECT_UNAUTHORIZED !== "false" };
}
