import { digitalNomadCitizenshipCategory, digitalNomadVisaRoute, nomadRouteAvailability } from "./route-semantics.js";
import { nomadPrTransition } from "./pr-transition.js";
import { nomadCitizenshipReview } from "./citizenship-review.js";

// Validate before replacing the displayed dataset, including partial research exports.
function datasetResults(json) {
  const results = Array.isArray(json) ? json : json?.results;
  if (!Array.isArray(results)) throw new Error("Expected an array or an object with a results array.");
  const dateFields = new Set(["researched_at", "accessed_at", "reviewed_at", "last_checked", "last_full_research_date"]);
  const integerFields = new Set(["rank", "visa_free_destinations", "visa_required_destinations", "visa_on_arrival_or_eta_destinations", "mobility_score"]);
  function validDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
  }
  function validateValues(value, path) {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      const childPath = `${path}.${key}`;
      if (dateFields.has(key) && child !== null && !validDate(child)) {
        throw new Error(`${childPath} must be a valid YYYY-MM-DD date.`);
      }
      const number = typeof child === "number" ? child : child?.value;
      if (typeof number === "number") {
        if (!Number.isFinite(number) || number < 0) throw new Error(`${childPath} must be a finite, non-negative number.`);
        if ((key.endsWith("_percent") || key === "rate_percent") && number > 100) {
          throw new Error(`${childPath} must not exceed 100 percent.`);
        }
        if (integerFields.has(key) && !Number.isInteger(number)) throw new Error(`${childPath} must be an integer.`);
        if (key === "rank" && number === 0) throw new Error(`${childPath} must be greater than zero.`);
      }
      validateValues(child, childPath);
    }
  }
  if (!Array.isArray(json) && json?.meta !== undefined) {
    if (!json.meta || typeof json.meta !== "object" || Array.isArray(json.meta)) throw new Error("Dataset metadata must be an object.");
    validateValues(json.meta, "meta");
    const updated = json.meta.updated_at;
    if (updated !== undefined && (typeof updated !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(updated) ||
      !validDate(updated.slice(0, 10)) || !Number.isFinite(Date.parse(updated)))) {
      throw new Error("meta.updated_at must be a valid ISO timestamp.");
    }
  }
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
    validateValues(data, country);
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
      ? { status: "research_error", label: "ERR", fullLabel: "Research failed", tone: "warn", rank: 6, description: "Research failed; route availability and citizenship are unknown.", review: null }
      : nomadCitizenshipReview(data);
    const citizenshipTimelines = failed ? [] : [
      data.timeline?.total_years_to_citizenship,
      data.timeline?.years_to_citizenship,
      data.citizenship?.years_to_citizenship,
      data.citizenship?.ordinary_naturalization_years,
      data.settlement_track?.years_to_citizenship
    ];
    // An explicitly recorded unknown is authoritative. Only absent legacy fields fall back.
    const citizenshipTimeline = citizenshipTimelines.find(value => value !== undefined);
    return {
      country: item.country ?? data.country ?? "UNKNOWN",
      status: item.status ?? "ok",
      data,
      availability: failed ? "research_error" : nomadRouteAvailability(data),
      valid: failed || nomadRouteAvailability(data) === "unconfirmed" ? null : nomadRouteAvailability(data) === "current",
      selectionValid: data.valid_for_selection === true,
      confidence: data.confidence ?? null,
      summary: data.selection_summary ?? "",
      bestRouteName: nomadRoute?.route_name ?? null,
      bestRouteType: nomadRoute?.route_type ?? null,
      nomadRoute,
      citizenshipTrack: data.settlement_track?.classification ?? "missing",
      citizenshipCategory: failed ? "research_error" : digitalNomadCitizenshipCategory(data),
      nomadTransition,
      prTransition: failed
        ? { status: "research_error", label: "ERR", fullLabel: "Research failed", tone: "warn", rank: 6, summary: "Research failed.", review: null }
        : nomadPrTransition(data),
      languages: data.languages?.official_languages ?? [],
      jusSoli: failed ? null : normalizeJusSoli(data.child_citizenship),
      income: numberValue(nomadRoute?.minimum_monthly_income_usd),
      incomeText: nomadRoute?.income_requirement_display?.value ?? null,
      tax: failed ? null : numberValue([
        data.taxes?.taxation_system?.top_personal_income_tax_rate_percent,
        data.taxes?.digital_nomad_taxation?.top_or_screening_pit_rate_percent,
        data.taxes?.income_tax_rate_percent
      ].find(value => value !== undefined)),
      taxText: taxTextValue(data),
      citizenshipYears: numberValue(citizenshipTimeline),
      citizenshipYearsText: recordedPeriodText(citizenshipTimeline),
      sourceCount: data.sources?.length ?? 0,
      error: item.error ?? null
    };
  });
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

export function recordedPeriodText(item) {
  const values = typeof item === "string" ? [item] : [item?.display_value, item?.value, item?.local_or_formula_value, item?.notes];
  return values.find(value => typeof value === "string" && value.trim()) ?? null;
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

export { normalizeResults, numberValue };
