import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { normalizeResults } from '../dashboard/dataset-model.js';
import { upsertCountry, currentNomadProjectionSummary, verifyImport } from '../scripts/import-to-supabase.mjs';

const html = await fs.readFile(new URL('../dashboard/index.html', import.meta.url), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
let sequence = 0;
function country(name, { income = null, tax = null, years = null, language = 'English', jusSoli = false } = {}) {
  return {
    country: name,
    best_routes: [{ route_name: 'Digital Nomad Visa', route_type: 'digital_nomad', valid_for_selection: false,
      minimum_monthly_income_usd: { value: income }, income_requirement_display: { value: 'Threshold recorded separately' } }],
    languages: { official_languages: [language] },
    taxes: { taxation_system: { top_personal_income_tax_rate_percent: tax } },
    timeline: { total_years_to_citizenship: { value: years, notes: 'Recorded general timeline' } },
    child_citizenship: { birthright_citizenship: { value: jusSoli ? 'unconditional_jus_soli' : 'conditional_jus_soli' } }
  };
}
const fixture = [country('Alpha', { income: 100, tax: 0, years: 2, jusSoli: true }),
  country('Beta', { income: 200, tax: 25, years: 5, language: 'Spanish' }),
  country('Gamma', { tax: 40 }), country('Delta', { income: 0, tax: 0, years: 0, language: 'Spanish' })];

async function dashboard(query = '', dataset = fixture) {
  const dom = new JSDOM(html, { url: `http://localhost/${query}`, runScripts: 'outside-only' });
  await tick();
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.fetch = async () => ({ ok: true, json: async () => dataset });
  const errors = [];
  dom.window.addEventListener('error', event => errors.push(event.error));
  await import(`../dashboard/app.js?criteria-audit=${sequence++}`);
  dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
  await tick();
  const el = selector => dom.window.document.querySelector(selector);
  const change = (selector, value) => {
    const input = el(selector);
    input.value = value;
    input.dispatchEvent(new dom.window.Event(input.tagName === 'SELECT' ? 'change' : 'input'));
  };
  const names = () => [...dom.window.document.querySelectorAll('#countryRows tr[data-country]')].map(row => row.dataset.country);
  const upload = async data => {
    Object.defineProperty(el('#jsonFile'), 'files', { configurable: true, value: [{ name: 'incoming.json', text: async () => JSON.stringify(data) }] });
    el('#jsonFile').dispatchEvent(new dom.window.Event('change'));
    await tick();
  };
  return { dom, el, change, names, upload, errors };
}

test('upload boundary rejects impossible numeric/date values without requiring full research records', () => {
  const cases = [
    { timeline: { total_years_to_citizenship: { value: -1 } } },
    { taxes: { taxation_system: { top_personal_income_tax_rate_percent: 101 } } },
    { taxes: { social_contributions_percent: { value: -1 } } },
    { passport: { visa_required_destinations: { value: 2.5 } } },
    { passport: { rank: { value: 0 } } },
    { researched_at: '2026-02-30' },
    { sources: [{ accessed_at: 'yesterday' }] },
    { timeline: { total_years_to_citizenship: { value: Infinity } } }
  ];
  for (const values of cases) assert.throws(() => normalizeResults([{ country: 'Invalid', ...values }]), /must/);
  assert.throws(() => normalizeResults({ meta: { updated_at: '2026-02-30T00:00:00Z' }, results: [] }), /timestamp/);
  assert.throws(() => normalizeResults({ meta: { last_full_research_date: '2026-13-01' }, results: [] }), /date/);
  assert.doesNotThrow(() => normalizeResults([{ country: 'Partial' }]));
  assert.doesNotThrow(() => normalizeResults([{ country: 'Leap', researched_at: '2024-02-29' }]));
  assert.doesNotThrow(() => normalizeResults([country('Zero', { income: 0, tax: 0, years: 0 })]));
});

test('rejected numeric upload preserves selected country, existing filters and rows', async () => {
  const ui = await dashboard();
  ui.change('#incomeMax', '100');
  ui.el('tr[data-country="Alpha"] button').click();
  const before = ui.names();
  await ui.upload([country('Negative', { income: -5, tax: -20, years: -1 })]);
  assert.match(ui.el('#fileStatus').textContent, /COULD NOT READ JSON/);
  assert.deepEqual(ui.names(), before);
  assert.equal(ui.el('#detailsPanel h2').textContent, 'Alpha');
  assert.equal(ui.el('#incomeMax').value, '100');
  assert.deepEqual(ui.errors, []);
  ui.dom.window.close();
});

test('numeric maxima retain real zero, exclude unknown values, and compose with language/jus-soli/search', async () => {
  const ui = await dashboard();
  for (const [selector, maximum, names] of [
    ['#incomeMax', '0', ['Delta']], ['#taxMax', '0', ['Delta', 'Alpha']], ['#citizenshipMax', '0', ['Delta']]
  ]) {
    ui.change(selector, maximum);
    assert.deepEqual(ui.names(), names, selector);
    ui.change(selector, '');
  }
  ui.change('#incomeMax', '100');
  ui.change('#taxMax', '0');
  ui.change('#citizenshipMax', '2');
  assert.deepEqual(ui.names(), ['Delta', 'Alpha']);
  ui.change('#languageFilter', 'English');
  ui.change('#jusSoliFilter', 'yes');
  ui.change('#searchInput', 'alpha');
  assert.deepEqual(ui.names(), ['Alpha']);
  ui.change('#jusSoliFilter', 'no');
  assert.deepEqual(ui.names(), []);
  assert.deepEqual(ui.errors, []);
  ui.dom.window.close();
});

test('all independent filter values survive copied URL together with sort and selection', async () => {
  const ui = await dashboard();
  ui.change('#validFilter', 'all');
  ui.change('#languageFilter', 'English');
  ui.change('#incomeMax', '100');
  ui.change('#taxMax', '0');
  ui.change('#citizenshipMax', '2');
  ui.change('#jusSoliFilter', 'yes');
  ui.change('#prPathFilter', 'unconfirmed');
  ui.change('#searchInput', 'Alpha');
  ui.el('th[data-sort="country"] button').click();
  ui.el('th[data-sort="country"] button').click();
  ui.el('tr[data-country="Alpha"] button').click();
  const query = ui.dom.window.location.search;
  ui.dom.window.close();
  const restored = await dashboard(query);
  assert.deepEqual(restored.names(), ['Alpha']);
  for (const [selector, expected] of [['#validFilter', 'all'], ['#languageFilter', 'English'], ['#incomeMax', '100'],
    ['#taxMax', '0'], ['#citizenshipMax', '2'], ['#jusSoliFilter', 'yes'], ['#prPathFilter', 'unconfirmed'], ['#searchInput', 'Alpha']]) {
    assert.equal(restored.el(selector).value, expected, selector);
  }
  assert.equal(restored.el('th[data-sort="country"]').getAttribute('aria-sort'), 'descending');
  assert.equal(restored.el('#detailsPanel h2').textContent, 'Alpha');
  assert.deepEqual(restored.errors, []);
  restored.dom.window.close();
});

test('numeric sorts keep missing values last in both directions and use unrounded numbers', async () => {
  const ui = await dashboard();
  await ui.upload([country('Low', { income: 100.1 }), country('High', { income: 100.4 }), country('Unknown')]);
  ui.el('th[data-sort="income"] button').click();
  assert.deepEqual(ui.names(), ['Low', 'High', 'Unknown']);
  ui.el('th[data-sort="income"] button').click();
  assert.deepEqual(ui.names(), ['High', 'Low', 'Unknown']);
  ui.change('#incomeMax', '100.2');
  assert.deepEqual(ui.names(), ['Low']);
  assert.deepEqual(ui.errors, []);
  ui.dom.window.close();
});

test('database projection stores canonical PR/CIT decisions separately from legacy settlement and country years', async () => {
  const record = { country: 'Projection', status: 'ok', data: country('Projection', { years: 7 }) };
  record.data.sources = [{ id: 'CIT', url: 'https://example.org/citizenship' }];
  record.data.digital_nomad_citizenship_review = {
    reviewed_route_names: ['Digital Nomad Visa'], status: 'confirmed', qualifying_status: 'Renewable remote-worker residence',
    remote_work_profile_supported: true, requires_status_switch: false, requires_exit: false, requires_permanent_residence: false,
    nomad_time_counts_toward_citizenship: true, years_to_citizenship: 3,
    summary: 'A separately documented reviewed chain.', requirements: ['Maintain qualifying residence.'],
    source_ids: ['CIT'], citizenship_source_ids: ['CIT'], reviewed_at: '2026-09-25', notes: 'This fixture separates chain years from general country years.'
  };
  const [row] = normalizeResults([record]);
  let columns, values;
  await upsertCountry({ async query(sql, parameters) {
    columns = sql.match(/insert into public\.countries\s*\(([\s\S]*?)\)\s*values/)[1].split(',').map(value => value.trim());
    values = parameters;
    return { rows: [{ id: 1 }] };
  } }, record, '00000000-0000-0000-0000-000000000000');
  const projected = Object.fromEntries(columns.map((key, index) => [key, values[index]]));
  assert.equal(projected.nomad_citizenship_status, row.nomadTransition.status);
  assert.equal(projected.nomad_pr_status, row.prTransition.status);
  assert.equal(projected.nomad_citizenship_years, 3);
  assert.equal(projected.years_to_citizenship, 7);
});

test('migration runner applies pending files in order once and records DDL atomically', async () => {
  const { applyPendingMigrations } = await import('../scripts/apply-supabase-migration.mjs');
  const applied = new Set();
  const ddl = [];
  let transaction;
  const db = { async query(sql, parameters = []) {
    if (sql === 'select name from public.schema_migrations') return { rows: [...applied].map(name => ({ name })) };
    if (sql === 'begin') transaction = { applied: new Set(applied), ddl: [...ddl] };
    else if (sql === 'rollback') {
      applied.clear();
      for (const name of transaction.applied) applied.add(name);
      ddl.splice(0, ddl.length, ...transaction.ddl);
      transaction = null;
    } else if (sql === 'commit') transaction = null;
    else if (sql.startsWith('insert into public.schema_migrations')) applied.add(parameters[0]);
    else if (sql === 'DDL one;' || sql === 'DDL two;') ddl.push(sql);
    else if (sql === 'BROKEN;') throw new Error('Migration failed');
    return { rows: [] };
  } };
  const files = [{ name: '002_second.sql', sql: 'begin;\nDDL two;\ncommit;' }, { name: '001_first.sql', sql: 'begin;\nDDL one;\ncommit;' }];
  assert.deepEqual(await applyPendingMigrations(db, files), ['001_first.sql', '002_second.sql']);
  assert.deepEqual(ddl, ['DDL one;', 'DDL two;']);
  assert.deepEqual(await applyPendingMigrations(db, files), []);
  assert.deepEqual(ddl, ['DDL one;', 'DDL two;']);
  await assert.rejects(applyPendingMigrations(db, [...files, { name: '003_failed.sql', sql: 'begin;\nBROKEN;\ncommit;' }]), /Migration failed/);
  assert.equal(applied.has('003_failed.sql'), false);
  assert.deepEqual(ddl, ['DDL one;', 'DDL two;']);
});

test('every categorical filter separates confirmed, conditional, unknown, unavailable, no-route and failed research', async () => {
  const { filterDashboardRows } = await import('../dashboard/filter-model.js');
  const statuses = ['confirmed', 'conditional', 'unconfirmed', 'not_available', 'not_applicable', 'research_error'];
  const rows = statuses.map((status, index) => {
    const [row] = normalizeResults([country(status, { income: index * 100, tax: index * 10, years: index, jusSoli: index === 0 })]);
    return { ...row, status: status === 'research_error' ? 'error' : 'ok', valid: index < 4 ? true : index === 4 ? false : null,
      jusSoli: index < 2 ? index === 0 : null,
      nomadTransition: { status, label: status, rank: index + 1 }, prTransition: { status, label: status, rank: index + 1 } };
  });
  const result = filters => filterDashboardRows(rows, filters).map(row => row.country);
  for (const status of statuses) {
    assert.deepEqual(result({ citizenship: status }), [status], `citizenship:${status}`);
    assert.deepEqual(result({ pr: status }), [status], `pr:${status}`);
  }
  assert.deepEqual(result({ visa: 'true' }), statuses.slice(0, 4));
  assert.deepEqual(result({ visa: 'false' }), ['not_applicable']);
  assert.deepEqual(result({ visa: 'error' }), ['research_error']);
  assert.deepEqual(result({ jusSoli: 'yes' }), ['confirmed']);
  assert.deepEqual(result({ jusSoli: 'no' }), ['conditional']);
  assert.deepEqual(result({ jusSoli: 'uncertain' }), statuses.slice(2));
  assert.deepEqual(result({ citizenship: 'not_confirmed' }), ['conditional', 'unconfirmed', 'not_available']);
  assert.deepEqual(result({ citizenship: 'direct' }), ['confirmed']);
  assert.deepEqual(result({ citizenship: 'category:unconfirmed' }), ['unconfirmed']);
  assert.deepEqual(result({ citizenship: 'category:separate_profile_route' }), ['conditional']);
  assert.deepEqual(result({ citizenship: 'category:no_visa' }), ['not_applicable']);
  assert.deepEqual(result({ citizenship: 'confirmed', pr: 'not_available' }), []);
});

test('post-import verification catches diverging settlement decisions even when row counts match', async () => {
  const { verifyImport } = await import('../scripts/import-to-supabase.mjs');
  const actual = { countries: 1, routes: 1, source_links: 1, snapshots: 1, digital_nomad_visas: 1,
    citizenship_statuses: { not_available: 1 }, pr_statuses: { confirmed: 1 } };
  const expected = { countries: 1, routes: 1, sourceLinks: 1, snapshots: 1, digitalNomadVisas: 1,
    citizenshipStatuses: { confirmed: 1 }, prStatuses: { confirmed: 1 } };
  await assert.rejects(verifyImport({ async query() { return { rows: [actual] }; } }, 'run', expected), /citizenship statuses/);
});

test('import verification counts current programmes separately from uncertain and pending availability', async () => {
  const results = ['current', 'unconfirmed', 'pending'].map(availability => {
    const data = country(availability);
    data.sources = [{ id: 'SOURCE', url: 'https://example.org/programme' }];
    data.best_routes[0].availability = { value: availability, source_ids: ['SOURCE'], notes: 'Reviewed programme availability.' };
    return { country: availability, status: 'ok', data };
  });
  const projected = [];
  for (const item of results) {
    await upsertCountry({ async query(sql, parameters) {
      const columns = sql.match(/insert into public\.countries\s*\(([\s\S]*?)\)\s*values/)[1].split(',').map(value => value.trim());
      projected.push(Object.fromEntries(columns.map((key, index) => [key, parameters[index]])));
      return { rows: [{ id: projected.length }] };
    } }, item, 'run');
  }
  assert.deepEqual(projected.map(row => row.dnv_available), [true, null, false]);
  const summary = currentNomadProjectionSummary({ results });
  assert.deepEqual(summary, { digitalNomadVisas: 1, citizenshipStatuses: { unconfirmed: 1 }, prStatuses: { unconfirmed: 1 } });
  const current = projected.filter(row => row.dnv_available === true);
  const statusCounts = key => current.reduce((counts, row) => {
    counts[row[key]] = (counts[row[key]] || 0) + 1;
    return counts;
  }, {});
  await assert.doesNotReject(verifyImport({ async query(sql) {
    assert.equal((sql.match(/dnv_available is true/g) || []).length, 3);
    return { rows: [{ countries: 3, routes: 3, source_links: 3, snapshots: 3, digital_nomad_visas: current.length,
      citizenship_statuses: statusCounts('nomad_citizenship_status'), pr_statuses: statusCounts('nomad_pr_status') }] };
  } }, 'run', { countries: 3, routes: 3, sourceLinks: 3, snapshots: 3, ...summary }));
});

test('uncertain visa availability stays distinct from pending and research error through URL restoration', async () => {
  const dataset = ['Current', 'Uncertain', 'Pending'].map((name, index) => {
    const data = country(name);
    data.sources = [{ id: 'SOURCE', url: 'https://example.org/programme' }];
    data.best_routes[0].availability = { value: ['current', 'unconfirmed', 'pending'][index], source_ids: ['SOURCE'], notes: 'Availability checked.' };
    return data;
  });
  dataset.push({ country: 'Failed', status: 'error', error: { message: 'Unavailable upstream' } });
  const ui = await dashboard('', dataset);
  assert.deepEqual(ui.names(), ['Current']);
  ui.change('#validFilter', 'uncertain');
  assert.deepEqual(ui.names(), ['Uncertain']);
  ui.change('#prCitFilter', 'unconfirmed');
  ui.el('tr[data-country="Uncertain"] button').click();
  const query = ui.dom.window.location.search;
  ui.dom.window.close();
  const restored = await dashboard(query, dataset);
  assert.deepEqual(restored.names(), ['Uncertain']);
  assert.equal(restored.el('#validFilter').value, 'uncertain');
  assert.equal(restored.el('#detailsPanel h2').textContent, 'Uncertain');
  restored.change('#prCitFilter', 'all');
  restored.change('#validFilter', 'error');
  assert.deepEqual(restored.names(), ['Failed']);
  restored.change('#validFilter', 'false');
  assert.deepEqual(restored.names(), ['Pending']);
  assert.deepEqual(restored.errors, []);
  restored.dom.window.close();
});
