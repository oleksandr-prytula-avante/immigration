import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { nomadPrTransition } from '../dashboard/pr-transition.js';

const html = await fs.readFile(new URL('../dashboard/index.html', import.meta.url), 'utf8');
const dataset = JSON.parse(await fs.readFile(new URL('../dashboard/data/all-countries.json', import.meta.url)));
let sequence = 0;
const tick = () => new Promise(resolve => setImmediate(resolve));

async function dashboard(query = '', fetchData = async () => ({ok:true,json:async()=>dataset})) {
  const dom = new JSDOM(html, {url:`http://localhost/${query}`, runScripts:'outside-only'});
  await tick(); // Let JSDOM finish its own initial lifecycle before importing the module.
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.fetch = fetchData;
  const errors = [];
  dom.window.addEventListener('error', event => errors.push(event.error));
  await import(`../dashboard/app.js?test=${sequence++}`);
  dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
  await tick();
  const el = selector => dom.window.document.querySelector(selector);
  const change = (selector, value) => {
    const input = el(selector);
    input.value = value;
    input.dispatchEvent(new dom.window.Event(input.tagName === 'SELECT' ? 'change' : 'input'));
  };
  const upload = async json => {
    Object.defineProperty(el('#jsonFile'), 'files', {configurable:true,value:[{name:'test.json',text:async()=>JSON.stringify(json)}]});
    el('#jsonFile').dispatchEvent(new dom.window.Event('change'));
    await tick();
  };
  return {dom,el,change,upload,errors};
}

test('ALL survives a copied URL, selected country and sort are restored', async () => {
  const first = await dashboard();
  assert.equal(first.el('#visibleCount').textContent, '48');
  first.change('#validFilter','all');
  first.el('th[data-sort="country"] button').click();
  first.el('tr[data-country="Spain"] button').click();
  const query = first.dom.window.location.search;
  assert.match(query, /dnv=all/);
  first.dom.window.close();
  const restored = await dashboard(query);
  assert.equal(restored.el('#visibleCount').textContent, '193');
  assert.equal(restored.el('#detailsPanel h2').textContent, 'Spain');
  assert.equal(restored.el('th[data-sort="country"]').getAttribute('aria-sort'), 'ascending');
  assert.equal(restored.el('tr.active button').getAttribute('aria-pressed'), 'true');
  restored.dom.window.close();
});

test('numeric filter and descending sort produce consistent rendered rows', async () => {
  const ui = await dashboard();
  ui.change('#citizenshipMax','1');
  assert.equal(ui.el('#visibleCount').textContent, '0');
  ui.change('#citizenshipMax','');
  ui.el('th[data-sort="income"] button').click();
  ui.el('th[data-sort="income"] button').click();
  assert.equal(ui.el('#countryRows tr').dataset.country, 'Thailand');
  assert.equal(ui.el('th[data-sort="income"]').getAttribute('aria-sort'), 'descending');
  ui.change('#prCitFilter', 'not_applicable');
  assert.equal(ui.el('#validFilter').value, 'all');
  assert.equal(ui.el('#visibleCount').textContent, '143');
  ui.dom.window.close();
});

test('uncertain programme availability is separate from NO and survives copied URLs', async () => {
  const ui = await dashboard();
  assert.equal(ui.el('tr[data-country="Cabo Verde"]'), null);
  ui.change('#validFilter', 'uncertain');
  const names = page => [...page.dom.window.document.querySelectorAll('#countryRows tr[data-country]')].map(row => row.dataset.country).sort();
  assert.deepEqual(names(ui), ['Cabo Verde', 'Saint Kitts and Nevis']);
  assert.equal(ui.el('tr[data-country="Cabo Verde"] .nomad-col').textContent.trim(), 'CND');
  assert.equal(ui.el('tr[data-country="Saint Kitts and Nevis"] .pr-col').textContent.trim(), 'UNK');
  const query = ui.dom.window.location.search;
  ui.dom.window.close();
  const restored = await dashboard(query);
  assert.equal(restored.el('#validFilter').value, 'uncertain');
  assert.deepEqual(names(restored), ['Cabo Verde', 'Saint Kitts and Nevis']);
  restored.change('#validFilter', 'false');
  assert.equal(restored.el('#visibleCount').textContent, '143');
  assert.ok(!names(restored).includes('Cabo Verde'));
  assert.deepEqual(restored.errors, []);
  restored.dom.window.close();
});

test('Uruguay PR and CIT include the separate permanent-residence chain and restores the confirmed filter from its URL', async () => {
  const ui = await dashboard();
  assert.equal(ui.el('th[data-sort="prPath"] button').textContent, 'PR PATH');
  const uruguay = ui.el('tr[data-country="Uruguay"]');
  assert.equal(uruguay.querySelector('.pr-col').textContent.trim(), 'YES');
  assert.equal(uruguay.querySelector('.nomad-col').textContent.trim(), 'YES');
  const conditionalPill = ui.el('tr[data-country="Estonia"] .pr-col .pill');
  assert.equal(conditionalPill.textContent, 'CND');
  assert.match(conditionalPill.title, /Conditional/);
  assert.equal(ui.el('tr[data-country="Greece"] .pr-col .pill').textContent, 'UNK');
  for (const pill of ui.dom.window.document.querySelectorAll('.pr-col .pill')) assert.ok(pill.textContent.length <= 3);
  uruguay.querySelector('button').click();
  const prDetail = [...ui.dom.window.document.querySelectorAll('#detailsPanel .detail-block')]
    .find(block => block.querySelector('h3')?.textContent === 'PERMANENT RESIDENCE AFTER NOMAD');
  assert.ok(prDetail);
  assert.match(prDetail.textContent, /REMOTE-WORK PROFILE: YES/);
  assert.match(prDetail.textContent, /NOMAD TIME COUNTS TOWARD PR: NO/);

  ui.change('#prPathFilter', 'confirmed');
  const expected = dataset.results.filter(item => nomadPrTransition(item.data).status === 'confirmed').map(item => item.country).sort();
  assert.ok(expected.length > 0);
  assert.equal(ui.el('#visibleCount').textContent, String(expected.length));
  const visibleCountries = current => [...current.dom.window.document.querySelectorAll('#countryRows tr[data-country]')].map(row => {
    assert.equal(row.querySelector('.pr-col').textContent.trim(), 'YES');
    return row.dataset.country;
  }).sort();
  assert.deepEqual(visibleCountries(ui), expected);
  ui.el('tr[data-country="Uruguay"] button').click();
  const query = ui.dom.window.location.search;
  assert.equal(new URLSearchParams(query).get('prPath'), 'confirmed');
  assert.deepEqual(ui.errors, []);
  ui.dom.window.close();

  const restored = await dashboard(query);
  assert.equal(restored.el('#prPathFilter').value, 'confirmed');
  assert.deepEqual(visibleCountries(restored), expected);
  assert.equal(restored.el('#detailsPanel h2').textContent, 'Uruguay');
  assert.deepEqual(restored.errors, []);
  restored.dom.window.close();
});

test('YEARS displays captured timelines with unchanged CIT labels and uses them for filtering and sorting', async () => {
  const ui = await dashboard('?dnv=all');
  const argentinaNotes = dataset.results.find(item => item.country === 'Argentina').data.timeline.total_years_to_citizenship.notes;
  for (const [country, years, citizenship] of [['Estonia', '8 YRS', 'CND'], ['Uruguay', '5 YRS', 'YES'], ['Austria', '10 YRS', 'N/A'], ['Argentina', argentinaNotes, 'CND']]) {
    const row = ui.el(`tr[data-country="${country}"]`);
    assert.equal(row.cells[4].textContent.trim(), citizenship, country);
    assert.equal(row.cells[5].textContent.trim(), years, country);
  }
  ui.change('#citizenshipMax', '5');
  assert.ok(ui.el('tr[data-country="Uruguay"]'));
  assert.equal(ui.el('tr[data-country="Estonia"]'), null);
  assert.equal(ui.el('tr[data-country="Argentina"]'), null);
  for (const row of ui.dom.window.document.querySelectorAll('#countryRows tr')) {
    assert.ok(Number.parseFloat(row.cells[5].textContent) <= 5);
  }
  ui.change('#citizenshipMax', '');
  for (const direction of ['ascending', 'descending']) {
    assert.equal(ui.el('th[data-sort="citizenship"]').getAttribute('aria-sort'), direction);
    const values = [...ui.dom.window.document.querySelectorAll('#countryRows tr')].map(row => Number.parseFloat(row.cells[5].dataset.years));
    const firstMissing = values.findIndex(Number.isNaN);
    assert.ok(firstMissing > 0);
    assert.ok(values.slice(firstMissing).every(Number.isNaN));
    const numbers = values.slice(0, firstMissing);
    assert.deepEqual(numbers, [...numbers].sort((a, b) => direction === 'ascending' ? a - b : b - a));
    ui.el('th[data-sort="citizenship"] button').click();
  }
  assert.deepEqual(ui.errors, []);
  ui.dom.window.close();
});

test('every country detail renders without errors and table/card route statuses agree', async () => {
  const ui = await dashboard('?dnv=all');
  for (const item of dataset.results) {
    ui.el(`tr[data-country="${item.country}"] button`).click();
    assert.equal(ui.el('#detailsPanel h2').textContent, item.country);
    assert.ok(ui.el('#detailsPanel .full-data pre'), item.country);
    const timeline = [...ui.dom.window.document.querySelectorAll('#detailsPanel .detail-block')]
      .find(block => block.querySelector('h3')?.textContent === 'COUNTRY CITIZENSHIP TIMELINE');
    assert.doesNotMatch(timeline.textContent, /NOT FOUND|NOT RECORDED/, item.country);
    for (const field of ['total_years_to_citizenship', 'years_to_temporary_residence', 'years_to_permanent_residence_after_temporary', 'years_to_citizenship_after_permanent_residence', 'typical_citizenship_processing_time_months']) {
      const value = item.data.timeline[field];
      assert.ok(timeline.textContent.includes(value.notes), `${item.country}: ${field} notes`);
      if (value.value !== null) assert.ok(timeline.textContent.includes(`${value.value} ${field.endsWith('_months') ? 'MONTHS' : 'YRS'}`), `${item.country}: ${field} value`);
    }
    const marriageYears = [...ui.dom.window.document.querySelectorAll('#detailsPanel li')].find(li => li.textContent.startsWith('MARRIAGE YEARS:'));
    assert.ok(marriageYears.textContent.includes(item.data.marriage.years_of_marriage_or_residence_required.notes), `${item.country}: marriage period notes`);
    assert.doesNotMatch(marriageYears.textContent, /NOT FOUND|NOT RECORDED/, item.country);
  }
  assert.deepEqual(ui.errors, []);
  ui.dom.window.close();
});

test('malformed upload keeps the previous dataset usable', async () => {
  const ui = await dashboard();
  await ui.upload({results:[{country:'Broken',languages:{official_languages:[1]}}]});
  assert.match(ui.el('#fileStatus').textContent, /COULD NOT READ JSON/);
  assert.equal(ui.el('#metricTotal').textContent, '193');
  ui.change('#searchInput','Portugal');
  assert.equal(ui.el('#visibleCount').textContent, '1');
  ui.el('tr[data-country="Portugal"] button').click();
  assert.deepEqual(ui.errors, []);
  ui.dom.window.close();
});

test('uploaded markup is escaped in numeric fields and unsafe URLs are not links', async () => {
  const ui = await dashboard('?dnv=all');
  const payload = '<img src=x onerror=alert(1)>';
  await ui.upload([{country:'Markup',taxes:{taxation_system:{top_personal_income_tax_rate_percent:payload,tax_brackets:[{rate_percent:payload}]}},sources:[{title:'Unsafe',url:'javascript:alert(1)'}],visa_application:{application_url:'javascript:alert(1)'}}]);
  ui.el('tr[data-country="Markup"] button').click();
  assert.equal(ui.el('#detailsPanel img'), null);
  assert.equal(ui.el('#detailsPanel a[href^="javascript:"]'), null);
  assert.match(ui.el('#detailsPanel').textContent, /<img src=x onerror=alert\(1\)>/);
  assert.deepEqual(ui.errors, []);
  ui.dom.window.close();
});

test('uploaded dataset wins over a late built-in response', async () => {
  let resolveFetch;
  const ui = await dashboard('?dnv=all', () => new Promise(resolve => {resolveFetch=resolve;}));
  await ui.upload([{country:'Uploaded'}]);
  resolveFetch({ok:true,json:async()=>dataset});
  await tick();
  assert.equal(ui.el('#metricTotal').textContent, '1');
  assert.equal(ui.el('#countryRows tr').dataset.country, 'Uploaded');
  assert.match(ui.el('#fileStatus').textContent, /LOADED FILE/);
  ui.dom.window.close();
});

test('HTTP errors are not presented as a successfully loaded empty dataset', async () => {
  const ui = await dashboard('', async () => ({ok:false,status:404,json:async()=>({})}));
  assert.match(ui.el('#fileStatus').textContent, /COULD NOT LOAD DEFAULT DATA: HTTP 404/);
  assert.equal(ui.el('#metricTotal').textContent, '0');
  ui.dom.window.close();
});


test('failed upload does not cancel an in-flight valid default dataset', async () => {
  let resolveFetch;
  const ui = await dashboard('', () => new Promise(resolve => {resolveFetch=resolve;}));
  await ui.upload({results:'invalid'});
  assert.match(ui.el('#fileStatus').textContent, /COULD NOT READ JSON/);
  resolveFetch({ok:true,json:async()=>dataset});
  await tick();
  assert.equal(ui.el('#metricTotal').textContent, '193');
  assert.equal(ui.el('#visibleCount').textContent, '48');
  ui.dom.window.close();
});

test('failed research is unknown and never classified as no visa', async () => {
  const ui = await dashboard('?dnv=all');
  await ui.upload([{country:'Failed',status:'error',error:{message:'Network failure'}}]);
  assert.match(ui.el('#countryRows').textContent, /RESEARCH ERROR/);
  assert.match(ui.el('#countryRows').textContent, /ERR/);
  ui.change('#prCitFilter','not_applicable');
  assert.equal(ui.el('#visibleCount').textContent, '0');
  ui.change('#prCitFilter','all');
  ui.change('#validFilter','error');
  assert.equal(ui.el('#visibleCount').textContent, '1');
  ui.el('tr[data-country="Failed"] button').click();
  assert.match(ui.el('#detailsPanel').textContent, /Network failure/);
  ui.dom.window.close();
});

test('passport details distinguish the index score from strictly visa-free access', async () => {
  const ui = await dashboard('?dnv=all');
  const passportDetail = () => [...ui.dom.window.document.querySelectorAll('#detailsPanel .detail-block')]
    .find(block => block.querySelector('h3')?.textContent === 'PASSPORT AND LANGUAGES');
  ui.el('tr[data-country="Belgium"] button').click();
  assert.match(passportDetail().textContent, /ACCESS SCORE \(COMBINED\): 186 DESTINATIONS/);
  assert.match(passportDetail().textContent, /STRICTLY VISA-FREE: 121 DESTINATIONS/);
  ui.el('tr[data-country="Japan"] button').click();
  assert.match(passportDetail().textContent, /ACCESS SCORE \(COMBINED\): 188 DESTINATIONS/);
  assert.match(passportDetail().textContent, /separate strictly visa-free-only count/);
  assert.doesNotMatch(passportDetail().textContent, /STRICTLY VISA-FREE: 188/);
  assert.deepEqual(ui.errors, []);
  ui.dom.window.close();
});
