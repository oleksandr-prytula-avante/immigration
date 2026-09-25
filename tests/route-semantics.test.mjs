import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  digitalNomadCitizenshipCategory,
  digitalNomadCitizenshipRoute,
  digitalNomadCitizenshipStatus,
  digitalNomadVisaRoute,
  hasDigitalNomadVisa
} from "../dashboard/route-semantics.js";

function nomadRoute(overrides = {}) {
  return {
    route_name: "Digital Nomad Visa",
    route_type: "digital_nomad",
    valid_for_selection: false,
    initial_validity: { value: "One year" },
    ...overrides
  };
}

function country(overrides = {}) {
  return {
    best_routes: [],
    rejected_routes: [],
    regular_foreign_contract_remote_work_fit: { value: true },
    settlement_track: {
      classification: "temporary_nomad_only",
      can_lead_to_citizenship_from_this_route: false
    },
    ...overrides
  };
}

test("visa existence is independent of the applicant's remote-work fit", () => {
  const route = nomadRoute();
  const data = country({
    best_routes: [route],
    regular_foreign_contract_remote_work_fit: { value: false }
  });

  assert.equal(digitalNomadVisaRoute(data), route);
  assert.equal(hasDigitalNomadVisa(data), true);
  assert.equal(digitalNomadCitizenshipStatus(data), "no");
  assert.equal(digitalNomadCitizenshipCategory(data), "temporary_only");
});

test("a separate permanent-residence route does not establish nomad citizenship", () => {
  const route = nomadRoute();
  const data = country({
    best_routes: [{
      route_type: "freelance_self_employed",
      valid_for_selection: true,
      direct_permanent_residence_possible: true,
      local_employer_required: false
    }],
    rejected_routes: [route],
    settlement_track: {
      classification: "strong_citizenship_track",
      can_lead_to_citizenship_from_this_route: true
    }
  });

  assert.equal(digitalNomadVisaRoute(data), route);
  assert.equal(digitalNomadCitizenshipRoute(data), null);
  assert.equal(digitalNomadCitizenshipStatus(data), "no");
  assert.equal(digitalNomadCitizenshipCategory(data), "separate_profile_route");
});

test("a confirmed nomad route takes precedence over a temporary alternative", () => {
  const temporary = nomadRoute();
  const unsupported = nomadRoute({ valid_for_selection: true, route_name: "Uncited citizenship claim" });
  const confirmed = nomadRoute({
    valid_for_selection: true,
    route_name: "Remote worker residence",
    path_to_citizenship: { value: "Qualifying residence can lead to citizenship.", source_ids: ["LAW"] }
  });
  const data = country({
    best_routes: [temporary, unsupported, confirmed],
    sources: [{ id: "LAW", url: "https://example.com/nationality-law" }],
    settlement_track: {
      classification: "possible_with_conversion",
      can_lead_to_citizenship_from_this_route: true,
      requires_switch_to_another_status: true
    }
  });

  assert.equal(digitalNomadVisaRoute(data), confirmed);
  assert.equal(digitalNomadCitizenshipRoute(data), confirmed);
  assert.equal(digitalNomadCitizenshipStatus(data), "yes");
  assert.equal(digitalNomadCitizenshipCategory(data), "confirmed");
});

test("uploaded citizenship claims require a route explanation and resolvable citations", () => {
  const route = nomadRoute({ valid_for_selection: true });
  const data = country({
    best_routes: [route],
    sources: [{ id: "LAW", url: "https://example.com/nationality-law" }],
    settlement_track: {
      classification: "strong_citizenship_track",
      can_lead_to_citizenship_from_this_route: true
    }
  });

  for (const path of [
    undefined,
    { value: " ", source_ids: ["LAW"] },
    { value: "A citizenship path is claimed.", source_ids: [] },
    { value: "A citizenship path is claimed.", source_ids: ["MISSING"] },
    { value: "A citizenship path is claimed.", source_ids: ["LAW", "MISSING"] }
  ]) {
    route.path_to_citizenship = path;
    assert.equal(digitalNomadCitizenshipRoute(data), null);
    assert.equal(digitalNomadCitizenshipStatus(data), "no");
    assert.equal(digitalNomadCitizenshipCategory(data), "unconfirmed");
  }

  route.path_to_citizenship = { value: "A citizenship path is claimed.", source_ids: ["LAW"] };
  assert.equal(digitalNomadCitizenshipRoute(data), route);
  for (const url of [undefined, "not a URL", "javascript:alert(1)"]) {
    data.sources[0].url = url;
    assert.equal(digitalNomadCitizenshipRoute(data), null);
  }
  data.sources = {};
  assert.equal(digitalNomadCitizenshipRoute(data), null);
});

test("unrelated country uncertainty does not override an explicitly rejected nomad track", () => {
  const data = country({
    rejected_routes: [nomadRoute()],
    settlement_track: {
      classification: "weak_or_uncertain_citizenship_track",
      can_lead_to_citizenship_from_this_route: "uncertain"
    }
  });

  assert.equal(digitalNomadCitizenshipCategory(data), "temporary_only");
  data.rejected_routes[0].valid_for_selection = "uncertain";
  assert.equal(digitalNomadCitizenshipCategory(data), "unconfirmed");
});

test("uncertain or missing settlement evidence is never confirmed", () => {
  const data = country({
    best_routes: [nomadRoute({ valid_for_selection: true })],
    settlement_track: {
      classification: "weak_or_uncertain_citizenship_track",
      can_lead_to_citizenship_from_this_route: "uncertain"
    }
  });

  assert.equal(digitalNomadCitizenshipStatus(data), "no");
  assert.equal(digitalNomadCitizenshipCategory(data), "unconfirmed");
  delete data.settlement_track.can_lead_to_citizenship_from_this_route;
  assert.equal(digitalNomadCitizenshipCategory(data), "unconfirmed");
});

test("pending programs and ordinary visitor permission are not current nomad visas", () => {
  const pending = country({
    best_routes: [nomadRoute()],
    settlement_track: { classification: "not_valid_pending_implementation" }
  });
  const visitor = country({
    rejected_routes: [nomadRoute({ route_name: "Digital-nomad remote work under visitor status" })]
  });

  for (const data of [pending, visitor]) {
    assert.equal(hasDigitalNomadVisa(data), false);
    assert.equal(digitalNomadCitizenshipStatus(data), "not_applicable");
    assert.equal(digitalNomadCitizenshipCategory(data), "no_visa");
  }
});

test("missing or malformed route arrays do not crash classification", () => {
  for (const data of [undefined, null, {}, { best_routes: {}, rejected_routes: "invalid" }]) {
    assert.equal(digitalNomadVisaRoute(data), null);
    assert.equal(digitalNomadCitizenshipRoute(data), null);
    assert.equal(digitalNomadCitizenshipCategory(data), "no_visa");
  }

  const data = country({
    best_routes: {},
    rejected_routes: [null, nomadRoute()],
    settlement_track: {
      classification: "strong_citizenship_track",
      can_lead_to_citizenship_from_this_route: true
    }
  });
  assert.equal(digitalNomadCitizenshipRoute(data), null);
});

const dataset = JSON.parse(fs.readFileSync(new URL("../dashboard/data/all-countries.json", import.meta.url)));

test("dataset nomad citizenship confirmations belong to the displayed route", () => {
  for (const { country: name, data } of dataset.results) {
    const route = digitalNomadCitizenshipRoute(data);
    if (route) {
      assert.equal(route, digitalNomadVisaRoute(data), name);
      assert.equal(route.valid_for_selection, true, name);
      assert.equal(data.settlement_track.can_lead_to_citizenship_from_this_route, true, name);
    }
  }
});

test("dataset distinguishes Uruguay's independent PR and Belize/UAE uncertainty from nomad status", () => {
  const expected = {
    Uruguay: "separate_profile_route",
    Belize: "temporary_only",
    "United Arab Emirates": "temporary_only"
  };
  for (const [name, category] of Object.entries(expected)) {
    const data = dataset.results.find((item) => item.country === name).data;
    assert.equal(hasDigitalNomadVisa(data), true, name);
    assert.equal(digitalNomadCitizenshipStatus(data), "no", name);
    assert.equal(digitalNomadCitizenshipCategory(data), category, name);
  }
});
