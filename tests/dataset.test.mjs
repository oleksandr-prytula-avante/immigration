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
