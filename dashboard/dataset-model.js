import { digitalNomadCitizenshipCategory, digitalNomadCitizenshipStatus, digitalNomadVisaRoute } from "./route-semantics.js";

// Validate before replacing the displayed dataset, including partial research exports.
function datasetResults(json) {
  const results = Array.isArray(json) ? json : json?.results;
  if (!Array.isArray(results)) throw new Error("Expected an array or an object with a results array.");
  const countries = new Set();
  for (const item of results) {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Every result must be a country record.");
    const data = item.data ?? item;
    const country = item.country ?? data?.country;
    if (!data || typeof data !== "object" || Array.isArray(data) || typeof country !== "string" || !country.trim()) {
      throw new Error("Every result must have a country name and an object record.");
    }
    if (item.data && data.country !== country) throw new Error(`${country}: wrapper and record country names differ.`);
    const key = country.trim().toLowerCase();
    if (countries.has(key)) throw new Error(`Duplicate country: ${country}`);
    countries.add(key);
    if (item.status !== undefined && !["ok", "error"].includes(item.status)) throw new Error(`${country}: unsupported result status.`);
    if (item.status === "ok" && Object.hasOwn(item, "data") && !item.data) throw new Error(`${country}: successful result has no data.`);
    for (const name of ["best_routes", "rejected_routes", "sources"]) {
      if (data[name] !== undefined && (!Array.isArray(data[name]) || data[name].some((value) => !value || typeof value !== "object" || Array.isArray(value)))) {
        throw new Error(`${country}: ${name} must be an array of records.`);
      }
    }
    const nestedLists = [
      ...[...(data.best_routes ?? []), ...(data.rejected_routes ?? [])].map((route) => ["key_requirements", route.key_requirements]),
      ["tax_brackets", data.taxes?.taxation_system?.tax_brackets]
    ];
    for (const [name, values] of nestedLists) {
      if (values !== undefined && values !== null && (!Array.isArray(values) || values.some((value) => !value || typeof value !== "object" || Array.isArray(value)))) {
        throw new Error(`${country}: ${name} must be an array of records.`);
      }
    }
    if (data.languages?.official_languages !== undefined && (!Array.isArray(data.languages.official_languages) || data.languages.official_languages.some((value) => typeof value !== "string" || !value.trim()))) {
      throw new Error(`${country}: official languages must be an array of non-empty strings.`);
    }
  }
  return results;
}

function normalizeResults(json) {
  const results = datasetResults(json);

  return results.map((item) => {
    const data = item.data ?? item;
    const failed = item.status === "error";
    const nomadRoute = failed ? null : digitalNomadVisaRoute(data);
    const nomadTransition = failed
      ? { status: "research_error", label: "UNKNOWN", tone: "warn", description: "Research failed; route availability and citizenship are unknown." }
      : buildNomadTransition(data, nomadRoute);
    return {
      country: item.country ?? data.country ?? "UNKNOWN",
      status: item.status ?? "ok",
      data,
      valid: item.status === "error" ? null : nomadRoute !== null,
      selectionValid: data.valid_for_selection === true,
      confidence: data.confidence ?? null,
      summary: data.selection_summary ?? "",
      bestRouteName: nomadRoute?.route_name ?? null,
      bestRouteType: nomadRoute?.route_type ?? null,
      nomadRoute,
      citizenshipTrack: data.settlement_track?.classification ?? "missing",
      citizenshipCategory: failed ? "research_error" : digitalNomadCitizenshipCategory(data),
      nomadTransition,
      languages: data.languages?.official_languages ?? [],
      jusSoli: failed ? null : normalizeJusSoli(data.child_citizenship),
      income: numberValue(nomadRoute?.minimum_monthly_income_usd),
      incomeText: nomadRoute?.income_requirement_display?.value ?? null,
      tax: failed ? null : firstNumberValue(
        data.taxes?.taxation_system?.top_personal_income_tax_rate_percent,
        data.taxes?.digital_nomad_taxation?.top_or_screening_pit_rate_percent,
        data.taxes?.income_tax_rate_percent
      ),
      taxText: taxTextValue(data),
      citizenshipYears: failed ? null : firstNumberValue(
        data.timeline?.total_years_to_citizenship,
        data.timeline?.years_to_citizenship,
        data.citizenship?.years_to_citizenship,
        data.citizenship?.ordinary_naturalization_years,
        data.settlement_track?.years_to_citizenship
      ),
      sourceCount: data.sources?.length ?? 0,
      error: item.error ?? null
    };
  });
}

function buildNomadTransition(data, route) {
  if (!route) {
    return {
      status: "no_nomad_route",
      label: "N/A",
      tone: "neutral",
      description: "No current digital-nomad or equivalent remote-work visa is captured, so citizenship from that route is not applicable."
    };
  }

  const settlement = data.settlement_track ?? {};
  const requiresSwitch = settlement.requires_switch_to_another_status;
  const citizenshipStatus = digitalNomadCitizenshipStatus(data);

  if (citizenshipStatus === "yes") {
    return {
      status: "direct",
      label: "YES",
      tone: "good",
      description: requiresSwitch === true
        ? "A citizenship path is recorded, but it requires switching to another qualifying residence status."
        : "The researched route is recorded as capable of leading to citizenship without a required status switch."
    };
  }

  if (citizenshipStatus === "no") {
    return {
      status: "no_citizenship_path",
      label: "NO",
      tone: "bad",
      description: "The digital-nomad visa exists, but this route has no confirmed path to citizenship."
    };
  }

  return {
    status: "no_citizenship_path",
    label: "NO",
    tone: "bad",
    description: "No confirmed citizenship path from this digital-nomad visa is recorded."
  };
}

function normalizeJusSoli(childCitizenship) {
  const classification = childCitizenship?.birthright_citizenship?.value;

  if (classification === "unconditional_jus_soli") return true;
  if ([
    "conditional_jus_soli",
    "restricted_jus_soli",
    "mostly_jus_sanguinis_or_conditional",
    "jus_sanguinis_limited",
    "restricted_jus_sanguinis"
  ].includes(classification)) return false;
  if (classification === "uncertain") return null;

  const legacyValue = childCitizenship?.jus_soli?.value;
  return typeof legacyValue === "boolean" ? legacyValue : null;
}

function numberValue(sourcedValue) {
  if (typeof sourcedValue === "number" && Number.isFinite(sourcedValue)) return sourcedValue;
  if (typeof sourcedValue?.value === "number" && Number.isFinite(sourcedValue.value)) return sourcedValue.value;
  return null;
}

function firstNumberValue(...values) {
  for (const value of values) {
    const number = numberValue(value);
    if (number !== null) return number;
  }
  return null;
}

function taxTextValue(data) {
  const display = data.taxes?.digital_nomad_taxation?.income_tax_display;
  if (typeof display === "string" && display.trim()) return display;

  const system = data.taxes?.taxation_system;
  if (typeof system?.value === "string" && system.value.trim()) return system.value;

  if (typeof system?.rate_type === "string" && system.rate_type.trim()) {
    const label = system.rate_type.replaceAll("_", " ").toUpperCase();
    return `${label} — RATE NOT CONFIRMED`;
  }

  const legacy = data.taxes?.income_tax_rate_percent?.value;
  return typeof legacy === "string" && legacy.trim() ? legacy : null;
}


export function matchesMaximum(value, maximum) {
  return maximum === null || (Number.isFinite(value) && value <= maximum);
}

export function compareNullableNumbers(a, b, direction = 1) {
  const missingA = !Number.isFinite(a);
  const missingB = !Number.isFinite(b);
  if (missingA || missingB) return missingA === missingB ? 0 : missingA ? 1 : -1;
  return (a - b) * direction;
}

export function safeHttpUrl(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function languageKey(value) {
  const name = String(value).replace(/\s*\([^)]*\)/g, "").trim();
  return new Map([["Castilian", "Spanish"], ["Standard Chinese", "Mandarin Chinese"]]).get(name) ?? name;
}

export { normalizeResults, numberValue, firstNumberValue };
