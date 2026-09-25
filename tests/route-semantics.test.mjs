import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { digitalNomadCitizenshipCategory, digitalNomadCitizenshipRoute, digitalNomadCitizenshipStatus, digitalNomadVisaRoute, hasDigitalNomadVisa, hasRecordedNomadRoute, nomadRouteAvailability } from "../dashboard/route-semantics.js";
import { citizenshipReviewIssues, nomadCitizenshipReview } from "../dashboard/citizenship-review.js";
import { citizenshipReviewSchema } from "../scripts/citizenship-review-schema.mjs";
import { routeAvailabilitySchema } from "../scripts/route-availability-schema.mjs";
import { validateDatasetDocument } from "../scripts/validate-dataset.mjs";

const dataset = JSON.parse(fs.readFileSync(new URL("../dashboard/data/all-countries.json", import.meta.url)));
const country = name => structuredClone(dataset.results.find(item => item.country === name).data);
const schema = JSON.parse(fs.readFileSync(new URL("../scripts/country-research.schema.json", import.meta.url)));

test("Uruguay confirms the full remote-work chain despite a separate PR application and no nomad credit", () => {
  const data = country("Uruguay");
  const route = digitalNomadVisaRoute(data);
  route.valid_for_selection = false; // Historical standalone-visa rejection is not the chain decision.
  data.settlement_track.can_lead_to_citizenship_from_this_route = false;
  assert.equal(data.digital_nomad_pr_transition.nomad_time_counts_toward_pr, false);
  assert.equal(data.digital_nomad_citizenship_review.requires_status_switch, true);
  assert.equal(digitalNomadCitizenshipStatus(data), "yes");
  assert.equal(digitalNomadCitizenshipRoute(data), route);
  assert.equal(nomadCitizenshipReview(data).label, "YES");
});

test("PR eligibility and legacy country flags never substitute for final citizenship evidence", () => {
  const data = country("Uruguay");
  delete data.digital_nomad_citizenship_review;
  assert.equal(data.digital_nomad_pr_transition.status, "confirmed");
  assert.equal(hasDigitalNomadVisa(data), true);
  assert.equal(digitalNomadCitizenshipStatus(data), "unconfirmed");
  assert.equal(digitalNomadCitizenshipRoute(data), null);
  assert.equal(nomadCitizenshipReview(data).label, "UNK");
});

test("cited current availability survives legacy settlement and standalone-route rejection", () => {
  const data = country("Uruguay");
  const route = digitalNomadVisaRoute(data);
  route.valid_for_selection = false;
  data.valid_for_selection = false;
  data.fully_matched = false;
  data.settlement_track.classification = "not_valid_for_selection";
  data.settlement_track.can_lead_to_citizenship_from_this_route = false;
  assert.equal(nomadRouteAvailability(data), "current");
  assert.equal(hasDigitalNomadVisa(data), true);
  assert.equal(hasRecordedNomadRoute(data), true);
  assert.equal(digitalNomadVisaRoute(data), route);
  assert.equal(digitalNomadCitizenshipStatus(data), "yes");
});

test("uncited, malformed or profile-incompatible citizenship claims cannot display YES", () => {
  for (const mutate of [
    review => { review.status = "yes"; },
    review => { review.summary = " "; },
    review => { review.notes = {}; },
    review => { review.requirements = [null]; },
    review => { review.remote_work_profile_supported = false; },
    review => { review.remote_work_profile_supported = "uncertain"; },
    review => { review.qualifying_status = null; },
    review => { review.citizenship_source_ids = []; },
    review => { review.citizenship_source_ids = ["UNLINKED_LAW"]; },
    review => { review.source_ids = ["MISSING"]; },
    review => { review.reviewed_route_names = ["Unrelated route"]; },
    review => { review.reviewed_at = "2026-02-30"; },
    review => { review.years_to_citizenship = -1; }
  ]) {
    const data = country("Uruguay");
    mutate(data.digital_nomad_citizenship_review);
    assert.equal(nomadCitizenshipReview(data).label, "UNK");
    assert.ok(citizenshipReviewIssues(data).length);
  }
  for (const url of ["javascript:alert(1)", "https://user:password@example.org/law"]) {
    const data = country("Uruguay");
    const id = data.digital_nomad_citizenship_review.source_ids[0];
    data.sources.find(source => source.id === id).url = url;
    assert.equal(nomadCitizenshipReview(data).label, "UNK");
  }
});

test("mandatory PR must be supported, while a nationality route without PR stays independent", () => {
  const uruguay = country("Uruguay");
  uruguay.digital_nomad_pr_transition.status = "unconfirmed";
  assert.equal(nomadCitizenshipReview(uruguay).label, "UNK");
  const andorra = country("Andorra");
  assert.equal(andorra.digital_nomad_citizenship_review.requires_permanent_residence, false);
  assert.equal(andorra.digital_nomad_pr_transition.status, "unconfirmed");
  assert.equal(nomadCitizenshipReview(andorra).label, "YES");
});

test("malformed citizenship source lists report unknown without crashing helpers or validation", () => {
  for (const field of ["source_ids", "citizenship_source_ids"]) {
    for (const value of [undefined, null, {}, "CITIZENSHIP_LAW", 42, [null]]) {
      const data = country("Uruguay");
      data.digital_nomad_citizenship_review[field] = value;
      const context = `${field}: ${JSON.stringify(value)}`;
      assert.doesNotThrow(() => {
        assert.equal(nomadCitizenshipReview(data).label, "UNK", context);
        assert.equal(digitalNomadCitizenshipRoute(data), null, context);
        assert.ok(citizenshipReviewIssues(data).some(issue => issue.includes(field)), context);
        const result = validateDatasetDocument({ results: [{ country: "Uruguay", status: "ok", data }] }, ["Uruguay"]);
        assert.equal(result.valid, false, context);
      }, context);
    }
  }
});

test("conditions, evidence gaps and supported absence remain separate from visa existence", () => {
  for (const [name, status, label] of [["Uruguay", "confirmed", "YES"], ["Estonia", "conditional", "CND"],
    ["Belize", "unconfirmed", "UNK"], ["Sri Lanka", "not_available", "NO"]]) {
    const data = country(name);
    assert.equal(hasDigitalNomadVisa(data), true, name);
    assert.equal(nomadCitizenshipReview(data).status, status, name);
    assert.equal(nomadCitizenshipReview(data).label, label, name);
    assert.equal(digitalNomadCitizenshipCategory(data), status, name);
  }
  assert.equal(digitalNomadCitizenshipStatus(country("Austria")), "not_applicable");
});

test("pending programmes, ordinary visitor permission and malformed route lists are not current nomad visas", () => {
  assert.equal(hasDigitalNomadVisa(country("Philippines")), false);
  const visitor = { rejected_routes: [{route_type:"digital_nomad", route_name:"Digital-nomad remote work under visitor status", initial_validity:{value:"90 days"}}] };
  for (const data of [visitor, undefined, null, {}, {best_routes:{},rejected_routes:"invalid"}]) {
    assert.equal(hasDigitalNomadVisa(data), false);
    assert.equal(digitalNomadCitizenshipRoute(data), null);
    assert.equal(digitalNomadCitizenshipCategory(data), "no_visa");
  }
});

test("pending and discontinued programmes cannot be revived by optimistic legacy flags", () => {
  for (const [name, availability] of [
    ...["Philippines", "Peru", "Jamaica", "Serbia"].map(name => [name, "pending"]),
    ...["Antigua and Barbuda", "Bahamas", "Iceland"].map(name => [name, "not_available"])
  ]) {
    const data = country(name);
    data.valid_for_selection = true;
    data.fully_matched = true;
    data.settlement_track.classification = "citizenship_track";
    data.settlement_track.can_lead_to_citizenship_from_this_route = true;
    for (const route of [...data.best_routes, ...data.rejected_routes]) {
      route.valid_for_selection = true;
      route.direct_temporary_residence_possible = true;
      route.initial_validity = { value: "Renewable residence" };
    }
    assert.equal(nomadRouteAvailability(data), availability, name);
    assert.equal(hasDigitalNomadVisa(data), false, name);
    assert.equal(hasRecordedNomadRoute(data), false, name);
    assert.equal(digitalNomadVisaRoute(data), null, name);
    assert.equal(digitalNomadCitizenshipCategory(data), "no_visa", name);
  }
});

test("unconfirmed operation keeps Cabo Verde and Saint Kitts as candidates without claiming a current visa", () => {
  for (const [name, label] of [["Cabo Verde", "CND"], ["Saint Kitts and Nevis", "UNK"]]) {
    const data = country(name);
    assert.equal(nomadRouteAvailability(data), "unconfirmed", name);
    assert.equal(hasDigitalNomadVisa(data), false, name);
    assert.equal(hasRecordedNomadRoute(data), true, name);
    assert.ok(digitalNomadVisaRoute(data), name);
    assert.equal(nomadCitizenshipReview(data).label, label, name);
    assert.equal(digitalNomadCitizenshipRoute(data), null, name);
    data.digital_nomad_citizenship_review.status = "confirmed";
    assert.equal(nomadCitizenshipReview(data).label, "UNK", name);
    assert.ok(citizenshipReviewIssues(data).some(issue => issue.includes("current initial nomad route")), name);
  }
});

test("all 50 nomad candidates have usable reviews, including 48 current and two uncertain programmes", () => {
  const nomads = dataset.results.filter(item => hasRecordedNomadRoute(item.data));
  assert.equal(nomads.length, 50);
  assert.equal(nomads.filter(item => hasDigitalNomadVisa(item.data)).length, 48);
  assert.deepEqual(nomads.filter(item => nomadRouteAvailability(item.data) === "unconfirmed").map(item => item.country).sort(), ["Cabo Verde", "Saint Kitts and Nevis"]);
  for (const { country: name, data } of nomads) {
    const review = data.digital_nomad_citizenship_review;
    assert.equal(nomadCitizenshipReview(data).review, review, name);
    assert.equal(data.fully_matched, data.digital_nomad_pr_transition.status === "confirmed", name);
    assert.equal(data.settlement_track.can_lead_to_citizenship_from_this_route, review.status === "confirmed" ? true : review.status === "not_available" ? false : "uncertain", name);
    assert.ok(review.reviewed_route_names.includes(digitalNomadVisaRoute(data).route_name), name);
    for (const id of review.citizenship_source_ids) assert.ok(data.sources.some(source => source.id === id), `${name}: ${id}`);
    if (review.status === "confirmed") assert.equal(review.remote_work_profile_supported, true, name);
  }
  assert.deepEqual(schema.properties.digital_nomad_citizenship_review, citizenshipReviewSchema);
});

test("both route lists use the shared cited availability schema", () => {
  for (const field of ["best_routes", "rejected_routes"]) {
    assert.deepEqual(schema.properties[field].items.properties.availability, routeAvailabilitySchema, field);
  }
});

test("dataset validation requires current citizenship reviews and complete review coverage", () => {
  const input = structuredClone(dataset);
  delete input.results.find(item => item.country === "Uruguay").data.digital_nomad_citizenship_review;
  const countries = dataset.results.map(item => item.country);
  assert.match(validateDatasetDocument(input, countries).errors.join("\n"), /Uruguay: current nomad research requires a citizenship review/);
  const item = { country:"Uruguay", status:"ok", data:country("Uruguay") };
  item.data.digital_nomad_citizenship_review.citizenship_source_ids = [];
  assert.match(validateDatasetDocument({results:[item]}, [item.country]).errors.join("\n"), /citizenship_source_ids/);
});
