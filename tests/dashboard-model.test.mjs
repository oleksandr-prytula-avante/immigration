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
    assert.equal(row.nomadTransition.status === 'direct', confirmed, row.country);
    assert.equal(row.citizenshipCategory, digitalNomadCitizenshipCategory(row.data), row.country);
    if (!confirmed) assert.equal(row.citizenshipYears, null, row.country);
  }
  assert.equal(rows.find(row => row.country === 'Uruguay').citizenshipYears, null);
});

test('maximum filters exclude missing and non-applicable values, including actual dataset', () => {
  assert.equal(matchesMaximum(null, null), true);
  assert.equal(matchesMaximum(null, 1), false);
  assert.equal(matchesMaximum(0, 0), true);
  assert.equal(matchesMaximum(1, 0), false);
  assert.equal(rows.filter(row => matchesMaximum(row.citizenshipYears, 1)).length, 0);
  assert.ok(rows.filter(row => matchesMaximum(row.income, 3500)).every(row => Number.isFinite(row.income)));
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
  assert.equal(row.nomadTransition.status, 'no_nomad_route');
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
