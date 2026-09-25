import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeResults, matchesMaximum, compareNullableNumbers, numberValue, safeHttpUrl, languageKey } from '../dashboard/dataset-model.js';
import { digitalNomadCitizenshipStatus, digitalNomadCitizenshipCategory } from '../dashboard/route-semantics.js';

const document = JSON.parse(fs.readFileSync(new URL('../dashboard/data/all-countries.json', import.meta.url)));
const rows = normalizeResults(document);

test('every table row agrees with canonical citizenship classification', () => {
  assert.equal(rows.length, 193);
  for (const row of rows) {
    const confirmed = digitalNomadCitizenshipStatus(row.data) === 'yes';
    assert.equal(row.nomadTransition.status === 'confirmed', confirmed, row.country);
    assert.equal(row.citizenshipCategory, digitalNomadCitizenshipCategory(row.data), row.country);
  }
});

test('citizenship years retain captured values independently of visa and citizenship status', () => {
  for (const [country, years, citizenshipLabel] of [['Estonia', 8, 'CND'], ['Uruguay', 5, 'YES'], ['Austria', 10, 'N/A']]) {
    const row = rows.find(row => row.country === country);
    assert.equal(row.citizenshipYears, years, country);
    assert.equal(row.nomadTransition.label, citizenshipLabel, country);
  }
  assert.equal(rows.find(row => row.country === 'Argentina').citizenshipYears, null);
  const textualTimelines = rows.filter(row => row.citizenshipYears === null);
  assert.equal(textualTimelines.length, 57);
  for (const row of textualTimelines) {
    assert.equal(row.citizenshipYearsText, row.data.timeline.total_years_to_citizenship.notes, row.country);
  }
  const [failed] = normalizeResults([{country:'Failed', status:'error', timeline:{total_years_to_citizenship:{value:5}}}]);
  assert.equal(failed.citizenshipYears, null);
  assert.equal(failed.citizenshipYearsText, null);
});

test('maximum filters exclude missing values and include captured timelines regardless of citizenship status', () => {
  assert.equal(matchesMaximum(null, null), true);
  assert.equal(matchesMaximum(null, 1), false);
  assert.equal(matchesMaximum(0, 0), true);
  assert.equal(matchesMaximum(1, 0), false);
  assert.equal(rows.filter(row => matchesMaximum(row.citizenshipYears, 1)).length, 0);
  const withinFiveYears = rows.filter(row => matchesMaximum(row.citizenshipYears, 5));
  assert.ok(withinFiveYears.some(row => row.country === 'Uruguay'));
  assert.ok(!withinFiveYears.some(row => row.country === 'Estonia' || row.country === 'Argentina'));
  assert.ok(rows.filter(row => matchesMaximum(row.income, 3500)).every(row => Number.isFinite(row.income)));
});

test('explicit unknown timeline and country tax do not borrow numbers from a different basis', () => {
  const [row] = normalizeResults([{country:'Example',
    timeline:{total_years_to_citizenship:{value:null,notes:'A complete total depends on the successor.'}},
    settlement_track:{years_to_citizenship:5},
    taxes:{taxation_system:{top_personal_income_tax_rate_percent:{value:null}},digital_nomad_taxation:{top_or_screening_pit_rate_percent:{value:0}}}
  }]);
  assert.equal(row.citizenshipYears, null);
  assert.equal(row.citizenshipYearsText, 'A complete total depends on the successor.');
  assert.equal(row.tax, null);
  assert.equal(matchesMaximum(row.citizenshipYears, 5), false);
  assert.equal(matchesMaximum(row.tax, 0), false);
  const [legacy] = normalizeResults([{country:'Legacy',settlement_track:{years_to_citizenship:5},taxes:{income_tax_rate_percent:{value:0}}}]);
  assert.equal(legacy.citizenshipYears, 5);
  assert.equal(legacy.tax, 0);
});

test('numeric sorts keep missing values last both ways and compare missing pairs equally', () => {
  assert.equal(compareNullableNumbers(null, null), 0);
  for (const direction of [1, -1]) {
    const sorted = [null, 15, null, 0, 25].sort((a,b) => compareNullableNumbers(a,b,direction));
    assert.deepEqual(sorted, direction === 1 ? [0,15,25,null,null] : [25,15,0,null,null]);
  }
  const sorted = rows.filter(row => row.valid).sort((a,b) => compareNullableNumbers(a.income,b.income,-1));
  assert.equal(sorted[0].country, 'Thailand');
  assert.equal(sorted.at(-1).income, null);
});

test('numeric normalization never coerces unknowns, booleans, strings or infinities', () => {
  for (const value of [null, '', '5', false, NaN, Infinity, {value:null}, {value:false}]) assert.equal(numberValue(value), null);
  assert.equal(numberValue({value:0}), 0);
});

test('invalid uploads fail before normalization can replace the dashboard', () => {
  for (const invalid of [null, {}, {results:{}}, [null], [1], [{}], [{country:'X',data:{country:'Y'}}], [{country:'X',sources:[null]}], [{country:'X',languages:{official_languages:[1]}}], [{country:'X',best_routes:[{key_requirements:[null]}]}], [{country:'X',taxes:{taxation_system:{tax_brackets:[null]}}}], [{country:'X'},{country:'x'}]]) {
    assert.throws(() => normalizeResults(invalid));
  }
  assert.deepEqual(normalizeResults([]), []);
  assert.equal(normalizeResults([{country:'Example', status:'error', error:{message:'Failed'}}])[0].valid, null);
});

test('legacy nomad status cannot contradict canonical visa existence', () => {
  const [row] = normalizeResults([{country:'Example',nomad_status:{status:'direct'}}]);
  assert.equal(row.valid, false);
  assert.equal(row.nomadTransition.status, 'not_applicable');
});

test('source and application links permit only credential-free HTTP(S) URLs', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,test', 'file:///etc/passwd', '//example.org', 'https://user:password@example.org', {}, null]) assert.equal(safeHttpUrl(url), null);
  assert.equal(safeHttpUrl('https://example.org/source'), 'https://example.org/source');
});

test('language filters group annotated names while preserving distinct languages', () => {
  assert.equal(languageKey('English (de facto UK-wide)'), 'English');
  assert.equal(languageKey('Spanish (Castilian; official statewide)'), 'Spanish');
  assert.equal(languageKey('Castilian (Spanish)'), 'Spanish');
  assert.equal(languageKey('English Creole'), 'English Creole');
  assert.equal(languageKey('constructor'), 'constructor');
  assert.ok(rows.find(row => row.country === 'Spain').languages.some(language => languageKey(language) === 'Spanish'));
});
