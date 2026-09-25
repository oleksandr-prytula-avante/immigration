import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { digitalNomadCitizenshipStatus, digitalNomadVisaRoute } from "../dashboard/route-semantics.js";
import { normalizeUrl, validISODate, validateDatasetDocument } from "../scripts/validate-dataset.mjs";

const document = JSON.parse(readFileSync(new URL("../dashboard/data/all-countries.json", import.meta.url), "utf8"));
const countries = JSON.parse(readFileSync(new URL("../countries.un-members-193.json", import.meta.url), "utf8"));
function fixture() {
  return { results: [structuredClone(document.results[0])] };
}
function validate(input) {
  return validateDatasetDocument(input, [document.results[0].country]);
}

test("all 193 country records satisfy schema, citations and consistency checks", () => {
  const result = validateDatasetDocument(document, countries);
  assert.equal(result.valid, true, result.errors.join("\n"));
  assert.equal(result.summary.countries, 193);
  assert.equal(result.summary.ok, 193);
  assert.equal(Object.values(result.summary.citizenship_categories).reduce((a, b) => a + b), 193);
});

test("malformed country shapes return validation errors without crashing route summaries", () => {
  for (const mutation of [
    (data) => { data.best_routes = {}; },
    (data) => { data.rejected_routes = [null]; },
    (data) => { delete data.timeline; },
    (data) => { data.confidence = "certain"; },
    (data) => { data.fully_matched = "false"; },
    (data) => { data.passport.rank.value = "42"; },
    (data) => { data.undocumented_field = true; }
  ]) {
    const input = fixture();
    mutation(input.results[0].data);
    assert.equal(validate(input).valid, false);
  }
  for (const input of [null, [], {}, { results: "invalid" }, { results: [null] }]) {
    assert.equal(validate(input).valid, false);
  }
});

test("dates must be actual calendar dates in every dated source and research field", () => {
  assert.equal(validISODate("2024-02-29"), true);
  for (const value of ["2025-02-29", "2026-02-30", "2026-13-01", "2026-08-15junk", "2026-08-15T00:00:00Z"]) {
    assert.equal(validISODate(value), false);
  }
  const input = fixture();
  input.results[0].data.sources[0].accessed_at = "2026-02-30";
  assert.match(validate(input).errors.join("\n"), /accessed_at must be a valid/);
});

test("numeric fields reject negative, fractional ranks and out-of-range percentages", () => {
  const input = fixture();
  input.results[0].data.passport.rank.value = 1.5;
  input.results[0].data.passport.visa_free_destinations.value = -1;
  input.results[0].data.taxes.taxation_system.top_personal_income_tax_rate_percent = 101;
  const errors = validate(input).errors.join("\n");
  assert.match(errors, /rank must be an integer/);
  assert.match(errors, /visa_free_destinations must not be negative/);
  assert.match(errors, /must not exceed 100 percent/);
});

test("country totals and completion metadata cannot disagree with actual records", () => {
  const input = fixture();
  input.meta = { total_countries: 193, completed_countries: 2, status: "complete", updated_at: "2026-02-30T00:00:00Z" };
  const result = validateDatasetDocument(input, countries, { allowPartial: true });
  assert.match(result.errors.join("\n"), /completed_countries/);
  assert.match(result.errors.join("\n"), /status=complete/);
  assert.match(result.errors.join("\n"), /updated_at/);
  for (const minimum of [0, -1, "15", NaN]) {
    assert.equal(validateDatasetDocument(fixture(), [document.results[0].country], { minimumSources: minimum }).valid, false);
  }
});

test("partial validation preserves country membership, duplicate and shape checks", () => {
  const input = fixture();
  input.meta = { total_countries: 193, completed_countries: 1, status: "in_progress" };
  assert.equal(validateDatasetDocument(input, countries).valid, false);
  assert.equal(validateDatasetDocument(input, countries, { allowPartial: true }).valid, true);
  input.results.push(structuredClone(input.results[0]));
  assert.match(validateDatasetDocument(input, countries, { allowPartial: true }).errors.join("\n"), /Duplicate countries/);
  input.results = [{ ...input.results[0], country: "Unknown country" }];
  assert.match(validateDatasetDocument(input, countries, { allowPartial: true }).errors.join("\n"), /Unexpected countries/);
  assert.equal(validateDatasetDocument({ results: [] }, countries, { allowPartial: true }).valid, false);
});

test("source references and canonical URLs cannot be duplicated or unresolved", () => {
  const input = fixture();
  const data = input.results[0].data;
  data.sources.at(-1).url = `${data.sources[0].url}#another-section`;
  data.visa_application.source_ids = ["MISSING", "MISSING"];
  data.sources[0].title = "   ";
  const errors = validate(input).errors.join("\n");
  assert.match(errors, /duplicate canonical source URLs/);
  assert.match(errors, /references missing source ID MISSING/);
  assert.match(errors, /contains duplicate source IDs/);
  assert.match(errors, /title is empty/);
  assert.equal(normalizeUrl("https://example.com/page/?z=2&a=1&utm_source=test#section"), "https://example.com/page?a=1&z=2");
  assert.equal(normalizeUrl("https://example.com/page?target=part/"), "https://example.com/page?target=part%2F");
  assert.equal(normalizeUrl("javascript:alert(1)"), null);
  assert.equal(normalizeUrl("https://user:password@example.com"), null);
});

test("missing citizenship citations fail validation even after the UI downgrades the claim", () => {
  const item = structuredClone(document.results.find((item) => digitalNomadCitizenshipStatus(item.data) === "yes"));
  digitalNomadVisaRoute(item.data).path_to_citizenship.source_ids = [];
  const result = validateDatasetDocument({ results: [item] }, [item.country]);
  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /requires cited route citizenship evidence/);
});

function prFixture() {
  const item = structuredClone(document.results.find(item => item.country === "Uruguay"));
  return { input: { results: [item] }, item, review: item.data.digital_nomad_pr_transition };
}

test("PR review rejects unsupported remote eligibility, credit and route claims", () => {
  for (const [mutate, pattern] of [
    [review => { review.remote_work_profile_supported = false; }, /confirmed requires/],
    [review => { review.pathway_type = "no_permanent_residence"; }, /confirmed requires/],
    [review => { review.qualifying_status = null; }, /confirmed requires/],
    [review => { review.pathway_type = "direct_residence_clock"; review.nomad_time_counts_toward_pr = false; }, /requires confirmed nomad residence credit/],
    [review => { review.reviewed_route_names.push("Unrelated nonexistent route"); }, /reviewed_route_names/],
    [review => { review.source_ids = []; }, /requires cited PR evidence/],
    [review => { review.source_ids = ["missing_pr_evidence"]; }, /references missing source ID/],
    [review => { review.reviewed_at = "2026-02-30"; }, /reviewed_at must be a valid/],
    [review => { review.notes = {}; }, /notes must be string/]
  ]) {
    const { input, item, review } = prFixture();
    mutate(review);
    assert.match(validateDatasetDocument(input, [item.country]).errors.join("\n"), pattern);
  }
});

test("complete PR review metadata requires coverage of every recorded nomad country", () => {
  const input = structuredClone(document);
  delete input.results.find(item => item.country === "Uruguay").data.digital_nomad_pr_transition;
  assert.match(validateDatasetDocument(input, countries).errors.join("\n"), /Uruguay: digital nomad PR review is missing/);
  input.meta.digital_nomad_pr_review.countries.pop();
  assert.match(validateDatasetDocument(input, countries).errors.join("\n"), /countries must match all current nomad countries/);
});

test("older exports without PR reviews remain valid, without claiming a completed review", () => {
  const { input, item } = prFixture();
  delete item.data.digital_nomad_pr_transition;
  const result = validateDatasetDocument(input, [item.country]);
  assert.equal(result.valid, true, result.errors.join("\n"));
  assert.equal(result.summary.digital_nomad_pr_reviews, 0);
});

test("cited values and duplicate citizenship classifications cannot silently disagree", () => {
  const input = fixture();
  const data = input.results[0].data;
  data.languages.russian_or_ukrainian_practicality.source_ids = [];
  data.citizenship_track_strength = data.settlement_track.citizenship_track_strength === "strong" ? "none" : "strong";
  data.passport.visa_required_destinations.value = 4.5;
  const errors = validate(input).errors.join("\n");
  assert.match(errors, /russian_or_ukrainian_practicality requires cited value evidence/);
  assert.match(errors, /citizenship_track_strength must agree/);
  assert.match(errors, /visa_required_destinations must be an integer/);
});

test("new nomad research requires PR review while historical imports remain compatible", () => {
  const { input, item } = prFixture();
  delete item.data.digital_nomad_pr_transition;
  assert.equal(validateDatasetDocument(input, [item.country]).valid, true);
  assert.match(validateDatasetDocument(input, [item.country], { requireNomadPrReview: true }).errors.join("\n"), /requires a PR review/);
});

test("combined passport scores retain their original amounts without masquerading as visa-free counts", () => {
  const passport = country => document.results.find(item => item.country === country).data.passport;
  assert.equal(passport("Belgium").mobility_score.value, 186);
  assert.equal(passport("Belgium").visa_free_destinations.value, 121);
  assert.equal(passport("Japan").mobility_score.value, 188);
  assert.equal(passport("Japan").visa_free_destinations.value, null);
  assert.match(passport("Japan").visa_free_destinations.notes, /separate strictly visa-free-only count/);
});

test("reviewed settlement and numeric corrections preserve their distinct legal meanings", () => {
  const data = country => document.results.find(item => item.country === country).data;
  const indonesia = data("Indonesia");
  assert.equal(digitalNomadCitizenshipStatus(indonesia), "no");
  assert.equal(indonesia.digital_nomad_pr_transition.status, "conditional");
  assert.equal(indonesia.timeline.years_to_permanent_residence_after_temporary.value, null);
  assert.equal(indonesia.timeline.total_years_to_citizenship.value, 5);
  assert.match(indonesia.best_routes[0].path_to_citizenship.value, /KITAP/);
  assert.match(data("Brazil").best_routes[0].extension_rules.notes, /multiple renewals/);
  assert.equal(data("Czechia").best_routes[0].minimum_monthly_income_usd.value, 3503);
  assert.equal(data("Czechia").best_routes[0].income_requirement_display.usd_monthly_value, 3503);
  assert.equal(data("Panama").digital_nomad_pr_transition.years_to_pr, 2);
  assert.equal(data("Canada").timeline.total_years_to_citizenship.value, 3);
  assert.equal(data("Mongolia").taxes.digital_nomad_taxation.top_or_screening_pit_rate_percent, 20);
  assert.deepEqual(data("Mongolia").taxes.taxation_system.tax_brackets.slice(0, 3).map(band => band.rate_percent), [10, 15, 20]);
  assert.equal(data("Guinea").labor_market.average_wage_usd_monthly.value, null);
  assert.match(data("Guinea").labor_market.average_wage_usd_monthly.notes, /177,792/);
  for (const [country, index] of [["Belarus", 0], ["Cote d'Ivoire", 2], ["Saint Vincent and the Grenadines", 0]]) {
    assert.equal(data(country).rejected_routes[index].income_requirement_display.usd_monthly_value, null, country);
  }
});
