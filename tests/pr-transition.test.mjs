import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { nomadPrTransition } from "../dashboard/pr-transition.js";
import { digitalNomadCitizenshipStatus, digitalNomadVisaRoute } from "../dashboard/route-semantics.js";
import { prTransitionSchema } from "../scripts/pr-transition-schema.mjs";
import { validISODate, validateDatasetDocument } from "../scripts/validate-dataset.mjs";

const dataset = JSON.parse(readFileSync(new URL("../dashboard/data/all-countries.json", import.meta.url), "utf8"));
const countrySchema = JSON.parse(readFileSync(new URL("../scripts/country-research.schema.json", import.meta.url), "utf8"));

function fixture(reviewOverrides = {}) {
  return {
    best_routes: [{ route_name: "Digital Nomad Visa", route_type: "digital_nomad", valid_for_selection: false }],
    rejected_routes: [],
    settlement_track: { classification: "temporary_nomad_only", can_lead_to_citizenship_from_this_route: false },
    sources: [{ id: "PR_LAW", url: "https://example.gov/permanent-residence", source_type: "law" }],
    digital_nomad_pr_transition: {
      reviewed_route_names: ["Digital Nomad Visa"],
      status: "confirmed",
      pathway_type: "separate_application",
      qualifying_status: "Ordinary permanent residence",
      remote_work_profile_supported: true,
      requires_status_switch: true,
      requires_exit: true,
      nomad_time_counts_toward_pr: false,
      years_to_pr: 0,
      summary: "A remote worker can separately apply for permanent residence.",
      requirements: ["Demonstrate sufficient remote-work income."],
      source_ids: ["PR_LAW"],
      reviewed_at: "2026-09-25",
      notes: "The nomad period is not credited; a separate application and exit are allowed.",
      ...reviewOverrides
    }
  };
}

test("a separate remote-work PR application is YES even when nomad time does not count and citizenship is NO", () => {
  const data = fixture();
  const transition = nomadPrTransition(data);
  assert.equal(transition.status, "confirmed");
  assert.equal(transition.label, "YES");
  assert.equal(transition.review, data.digital_nomad_pr_transition);
  assert.equal(transition.review.nomad_time_counts_toward_pr, false);
  assert.equal(transition.review.requires_exit, true);
  assert.equal(digitalNomadCitizenshipStatus(data), "no");
});

test("conditional and unconfirmed PR paths retain their distinctions from YES and NO", () => {
  for (const [status, label] of [["conditional", "CND"], ["unconfirmed", "UNK"], ["not_available", "NO"]]) {
    const transition = nomadPrTransition(fixture({ status, years_to_pr: null }));
    assert.equal(transition.status, status);
    assert.equal(transition.label, label);
  }
  const legacy = fixture();
  delete legacy.digital_nomad_pr_transition;
  assert.equal(nomadPrTransition(legacy).label, "UNK");
  assert.equal(nomadPrTransition({ ...legacy, best_routes: [] }).label, "N/A");
});

test("PR claims require an explanation and references to the displayed existing route", () => {
  for (const overrides of [
    { status: "yes" },
    { summary: "  " },
    { notes: { toString: 0 } },
    { requirements: [{ text: "Unvalidated requirement" }] },
    { reviewed_route_names: undefined },
    { reviewed_route_names: [] },
    { reviewed_route_names: ["Unrelated residence"] },
    { reviewed_route_names: ["Digital Nomad Visa", "Invented route"] },
    { reviewed_route_names: ["Digital Nomad Visa", "Digital Nomad Visa"] }
  ]) {
    const transition = nomadPrTransition(fixture(overrides));
    assert.equal(transition.label, "UNK", JSON.stringify(overrides));
    assert.equal(transition.review, null);
  }
});

test("PR claims with missing, unresolved or unsafe source references display UNCONFIRMED", () => {
  for (const source_ids of [undefined, [], ["MISSING"], ["PR_LAW", "MISSING"], [null]]) {
    assert.equal(nomadPrTransition(fixture({ source_ids })).label, "UNK");
  }
  for (const url of [undefined, "not a URL", "javascript:alert(1)", "https://user:password@example.gov/law"]) {
    const data = fixture();
    data.sources[0].url = url;
    assert.equal(nomadPrTransition(data).label, "UNK", String(url));
  }
  assert.equal(nomadPrTransition({ ...fixture(), sources: {} }).label, "UNK");
});

test("contradictory confirmed PR claims cannot become YES in an uploaded dataset", () => {
  for (const overrides of [
    { remote_work_profile_supported: false },
    { remote_work_profile_supported: "uncertain" },
    { qualifying_status: null },
    { qualifying_status: "  " },
    { pathway_type: "uncertain" },
    { pathway_type: "no_permanent_residence" },
    { pathway_type: "direct_residence_clock", nomad_time_counts_toward_pr: false }
  ]) {
    const transition = nomadPrTransition(fixture(overrides));
    assert.equal(transition.label, "UNK", JSON.stringify(overrides));
    assert.equal(transition.review, null);
  }
});

test("the research schema uses the same PR review definition as generated requests", () => {
  assert.deepEqual(countrySchema.properties.digital_nomad_pr_transition, prTransitionSchema);
});

test("every one of the 49 current nomad countries has a dated, cited review of its displayed route", () => {
  const nomadCountries = dataset.results.filter(item => digitalNomadVisaRoute(item.data));
  assert.equal(nomadCountries.length, 49);
  assert.equal(dataset.results.filter(item => item.data.digital_nomad_pr_transition).length, 49);
  for (const { country, data } of nomadCountries) {
    const review = data.digital_nomad_pr_transition;
    assert.ok(review, country);
    assert.equal(nomadPrTransition(data).review, review, `${country}: review must be usable without a fallback`);
    assert.ok(validISODate(review.reviewed_at), `${country}: review date`);
    assert.ok(review.reviewed_route_names.includes(digitalNomadVisaRoute(data).route_name), country);
    if (review.status === "confirmed") assert.equal(review.remote_work_profile_supported, true, country);
    for (const id of review.source_ids) {
      const source = data.sources.find(source => source.id === id);
      assert.ok(source, `${country}: ${id}`);
      assert.ok(["official_government", "law"].includes(source.source_type), `${country}: ${id} must be primary evidence`);
    }
  }
});

test("Uruguay has a confirmed separate PR application while its nomad citizenship label stays NO", () => {
  const { data } = dataset.results.find(item => item.country === "Uruguay");
  const transition = nomadPrTransition(data);
  assert.equal(transition.label, "YES");
  assert.equal(transition.review.pathway_type, "separate_application");
  assert.equal(transition.review.nomad_time_counts_toward_pr, false);
  assert.equal(transition.review.remote_work_profile_supported, true);
  assert.equal(digitalNomadCitizenshipStatus(data), "no");
});

test("the dataset validator rejects malformed and contradictory PR review fields", () => {
  const original = dataset.results.find(item => item.country === "Uruguay");
  const baseline = structuredClone(original);
  const routeName = digitalNomadVisaRoute(baseline.data).route_name;
  baseline.data.digital_nomad_pr_transition = {
    ...fixture().digital_nomad_pr_transition,
    reviewed_route_names: [routeName],
    source_ids: [baseline.data.sources[0].id]
  };
  const validate = item => validateDatasetDocument({ results: [item] }, [item.country]);
  assert.equal(validate(baseline).valid, true);
  for (const overrides of [
    { status: "yes" },
    { reviewed_at: "2026-02-30" },
    { reviewed_route_names: [routeName, "Invented route"] },
    { source_ids: [] },
    { source_ids: ["MISSING_PR_EVIDENCE"] },
    { remote_work_profile_supported: false },
    { qualifying_status: null },
    { pathway_type: "no_permanent_residence" },
    { pathway_type: "direct_residence_clock", nomad_time_counts_toward_pr: false },
    { years_to_pr: -1 },
    { status: "not_available", years_to_pr: 2 }
  ]) {
    const item = structuredClone(baseline);
    Object.assign(item.data.digital_nomad_pr_transition, overrides);
    const result = validate(item);
    assert.equal(result.valid, false, JSON.stringify(overrides));
    assert.ok(result.errors.some(error => error.includes("digital_nomad_pr_transition")), result.errors.join("\n"));
  }
});
