import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  digitalNomadCitizenshipCategory,
  digitalNomadCitizenshipStatus,
  digitalNomadVisaRoute,
  hasDigitalNomadVisa
} from "../dashboard/route-semantics.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const countrySchema = JSON.parse(readFileSync(path.join(root, "scripts/country-research.schema.json"), "utf8"));

export function validateDatasetDocument(document, expectedCountries, options = {}) {
  const errors = [];
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    errors.push("Dataset must be an object");
  }
  if (!Array.isArray(document?.results)) errors.push("Dataset results must be an array");
  const results = Array.isArray(document?.results) ? document.results : [];
  const minimumSources = options.minimumSources ?? document?.meta?.minimum_distinct_source_urls_per_country ?? 15;
  if (!Number.isInteger(minimumSources) || minimumSources < 1) {
    errors.push("minimum_distinct_source_urls_per_country must be a positive integer");
  }
  const names = results.map((item) => item?.country);

  if (!options.allowPartial && results.length !== expectedCountries.length) {
    errors.push(`Expected ${expectedCountries.length} results, found ${results.length}`);
  }
  if (options.allowPartial && results.length === 0) errors.push("Partial dataset must contain at least one country");

  const duplicateNames = duplicates(names);
  const missingNames = expectedCountries.filter((country) => !names.includes(country));
  const extraNames = names.filter((country) => !expectedCountries.includes(country));
  if (duplicateNames.length) errors.push(`Duplicate countries: ${duplicateNames.join(", ")}`);
  if (!options.allowPartial && missingNames.length) errors.push(`Missing countries: ${missingNames.join(", ")}`);
  if (extraNames.length) errors.push(`Unexpected countries: ${extraNames.join(", ")}`);

  validateMetadata(document?.meta, results, expectedCountries, errors);
  // Invalid shapes must be reported before route helpers or the importer consume them.
  const structurallyValidResults = results.filter((item) => validateCountry(item, minimumSources, errors));

  const digitalNomadVisas = structurallyValidResults.filter((item) => hasDigitalNomadVisa(item.data));
  const citizenshipStatuses = digitalNomadVisas.reduce((counts, item) => {
    const status = digitalNomadCitizenshipStatus(item?.data);
    counts[status] = (counts[status] || 0) + 1;
    return counts;
  }, {});
  const citizenshipCategories = structurallyValidResults.reduce((counts, item) => {
    const category = digitalNomadCitizenshipCategory(item?.data);
    counts[category] = (counts[category] || 0) + 1;
    return counts;
  }, {});

  return {
    valid: errors.length === 0,
    errors,
    summary: {
      countries: results.length,
      ok: results.filter((item) => item?.status === "ok").length,
      routes: results.reduce(
        (sum, item) => sum + arrayLength(item?.data?.best_routes) + arrayLength(item?.data?.rejected_routes),
        0
      ),
      source_links: results.reduce((sum, item) => sum + arrayLength(item?.data?.sources), 0),
      minimum_sources: minimumSources,
      digital_nomad_visas: digitalNomadVisas.length,
      digital_nomad_visas_with_citizenship: citizenshipStatuses.yes || 0,
      digital_nomad_visas_without_citizenship: citizenshipStatuses.no || 0,
      citizenship_categories: citizenshipCategories
    }
  };
}

function validateCountry(item, minimumSources, errors) {
  const country = item?.country || "<missing country>";
  const data = item?.data;
  if (item?.status !== "ok") errors.push(`${country}: status must be ok`);
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    errors.push(`${country}: data must be an object`);
    return false;
  }
  const previousErrorCount = errors.length;
  validateSchema(data, countrySchema, `${country}: data`, errors);
  if (errors.length > previousErrorCount) return false;
  if (data.country !== country) errors.push(`${country}: data.country does not match wrapper country`);
  validateDatesAndNumbers(data, `${country}: data`, errors);

  const sources = Array.isArray(data.sources) ? data.sources : [];
  const normalizedUrls = sources.map((source) => normalizeUrl(source?.url)).filter(Boolean);
  const sourceIds = sources.map((source) => source?.id).filter(Boolean);
  if (new Set(normalizedUrls).size < minimumSources) {
    errors.push(`${country}: fewer than ${minimumSources} distinct source URLs`);
  }
  if (normalizedUrls.length !== new Set(normalizedUrls).size) {
    errors.push(`${country}: duplicate canonical source URLs`);
  }
  if (sourceIds.length !== new Set(sourceIds).size) errors.push(`${country}: duplicate source IDs`);
  sources.forEach((source, index) => {
    if (!source?.id?.trim()) errors.push(`${country}: sources[${index}].id is empty`);
    if (!normalizeUrl(source?.url)) errors.push(`${country}: sources[${index}].url is invalid`);
    if (!source?.title?.trim()) errors.push(`${country}: sources[${index}].title is empty`);
  });

  const sourceIdSet = new Set(sourceIds);
  collectSourceIdReferences(data, "", (id, propertyPath) => {
    if (!sourceIdSet.has(id)) errors.push(`${country}: ${propertyPath} references missing source ID ${id}`);
  });

  if (!Array.isArray(data.languages?.official_languages) || data.languages.official_languages.length === 0) {
    errors.push(`${country}: official languages are empty`);
  }
  if (!data.child_citizenship?.birthright_citizenship?.value) {
    errors.push(`${country}: birthright citizenship classification is missing`);
  }
  if (!data.settlement_track?.classification) {
    errors.push(`${country}: settlement classification is missing`);
  }
  if (data.valid_for_selection === true && data.fully_matched !== true) {
    errors.push(`${country}: valid_for_selection=true requires fully_matched=true`);
  }
  if (data.fully_matched === true && data.valid_for_selection !== true) {
    errors.push(`${country}: fully_matched=true requires valid_for_selection=true`);
  }

  const citizenshipRoute = digitalNomadVisaRoute(data);
  if (citizenshipRoute?.valid_for_selection === true && data.settlement_track?.can_lead_to_citizenship_from_this_route === true) {
    const citizenshipPath = citizenshipRoute?.path_to_citizenship;
    if (typeof citizenshipPath?.value !== "string" || !citizenshipPath.value.trim()) {
      errors.push(`${country}: dashboard citizenship YES requires a non-empty route citizenship path`);
    }
    if (!Array.isArray(citizenshipPath?.source_ids) || citizenshipPath.source_ids.length === 0) {
      errors.push(`${country}: dashboard citizenship YES requires cited route citizenship evidence`);
    }
  }

  if (digitalNomadCitizenshipStatus(data) === "no") {
    const nomadRoute = digitalNomadVisaRoute(data);
    for (const fieldName of ["path_to_permanent_residence", "path_to_citizenship"]) {
      const field = nomadRoute?.[fieldName];
      const explanation = [field?.value, field?.notes]
        .some((value) => typeof value === "string" && value.trim());
      if (!explanation) {
        errors.push(`${country}: dashboard citizenship NO requires an explained ${fieldName}`);
      }
      if (!Array.isArray(field?.source_ids) || field.source_ids.length === 0) {
        errors.push(`${country}: dashboard citizenship NO requires cited ${fieldName} evidence`);
      }
    }
  }

  collectSourcedNulls(data, "", (value, propertyPath) => {
    const notes = typeof value.notes === "string" ? value.notes.trim() : "";
    const ids = Array.isArray(value.source_ids) ? value.source_ids : [];
    if (!notes || ids.length === 0) {
      errors.push(`${country}: ${propertyPath} has an unexplained or uncited null value`);
    }
  });
  return true;
}

function arrayLength(value) {
  return Array.isArray(value) ? value.length : 0;
}

function validateMetadata(meta, results, expectedCountries, errors) {
  if (meta === undefined) return;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    errors.push("Dataset meta must be an object");
    return;
  }
  if (meta.total_countries !== undefined && meta.total_countries !== expectedCountries.length) {
    errors.push(`meta.total_countries must match the country set (${expectedCountries.length})`);
  }
  const completed = results.filter((item) => item?.status === "ok").length;
  if (meta.completed_countries !== undefined && meta.completed_countries !== completed) {
    errors.push(`meta.completed_countries must match successful results (${completed})`);
  }
  if (meta.status === "complete" && completed !== expectedCountries.length) {
    errors.push("meta.status=complete requires all expected countries to be successful");
  }
  if (meta.updated_at !== undefined && (
    typeof meta.updated_at !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(meta.updated_at) ||
    !validISODate(meta.updated_at.slice(0, 10)) || !Number.isFinite(Date.parse(meta.updated_at))
  )) {
    errors.push("meta.updated_at must be a valid ISO timestamp");
  }
  if (meta.last_full_research_date !== undefined && !validISODate(meta.last_full_research_date)) {
    errors.push("meta.last_full_research_date must be a valid YYYY-MM-DD date");
  }
}

// The research schema uses this deliberately small JSON Schema subset.
function validateSchema(value, schema, propertyPath, errors) {
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  const actualType = value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
  if (!types.includes(actualType) || (actualType === "number" && !Number.isFinite(value))) {
    errors.push(`${propertyPath} must be ${types.join(" or ")}`);
    return;
  }
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${propertyPath} has unsupported value ${JSON.stringify(value)}`);
  }
  if (actualType === "object") {
    for (const required of schema.required || []) {
      if (!Object.hasOwn(value, required)) errors.push(`${propertyPath}.${required} is required`);
    }
    for (const [key, child] of Object.entries(value)) {
      if (schema.properties?.[key]) validateSchema(child, schema.properties[key], `${propertyPath}.${key}`, errors);
      else if (schema.additionalProperties === false) errors.push(`${propertyPath}.${key} is not allowed`);
    }
  } else if (actualType === "array") {
    value.forEach((child, index) => validateSchema(child, schema.items, `${propertyPath}[${index}]`, errors));
  }
}

export function validISODate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function validateDatesAndNumbers(value, propertyPath, errors) {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${propertyPath}.${key}`;
    if (["researched_at", "accessed_at", "reviewed_at", "last_checked"].includes(key) && child !== null && !validISODate(child)) {
      errors.push(`${childPath} must be a valid YYYY-MM-DD date`);
    }
    const number = typeof child === "number" ? child : child?.value;
    if (typeof number === "number") {
      if (number < 0) errors.push(`${childPath} must not be negative`);
      if ((key.endsWith("_percent") || key === "rate_percent") && number > 100) {
        errors.push(`${childPath} must not exceed 100 percent`);
      }
      if (["rank", "visa_free_destinations"].includes(key) && !Number.isInteger(number)) {
        errors.push(`${childPath} must be an integer`);
      }
      if (key === "rank" && number === 0) errors.push(`${childPath} must be greater than zero`);
    }
    if (key === "source_ids" && Array.isArray(child) && duplicates(child).length) {
      errors.push(`${childPath} contains duplicate source IDs`);
    }
    if (key === "application_url" && child !== null && !normalizeUrl(child)) {
      errors.push(`${childPath} must be an HTTP(S) URL`);
    }
    validateDatesAndNumbers(child, childPath, errors);
  }
}

function collectSourceIdReferences(value, currentPath, callback) {
  if (Array.isArray(value)) {
    if (currentPath.endsWith("source_ids")) value.forEach((id) => callback(id, currentPath));
    else value.forEach((item, index) => collectSourceIdReferences(item, `${currentPath}[${index}]`, callback));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value)) {
    collectSourceIdReferences(item, currentPath ? `${currentPath}.${key}` : key, callback);
  }
}

function collectSourcedNulls(value, currentPath, callback) {
  if (!value || typeof value !== "object") return;
  if (!Array.isArray(value) && Object.prototype.hasOwnProperty.call(value, "value") && value.value === null) {
    callback(value, currentPath || "$");
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectSourcedNulls(item, `${currentPath}[${index}]`, callback));
  } else {
    for (const [key, item] of Object.entries(value)) {
      collectSourcedNulls(item, currentPath ? `${currentPath}.${key}` : key, callback);
    }
  }
}

export function normalizeUrl(value) {
  try {
    if (typeof value !== "string" || !value.trim()) return null;
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    url.pathname = url.pathname.replace(/\/$/, "");
    return url.toString();
  } catch {
    return null;
  }
}

function duplicates(values) {
  const seen = new Set();
  const repeated = new Set();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated];
}

async function main() {
  const inputPath = path.resolve(root, process.argv[2] || "dashboard/data/all-countries.json");
  const [document, expectedCountries] = await Promise.all([
    fs.readFile(inputPath, "utf8").then(JSON.parse),
    fs.readFile(path.join(root, "countries.un-members-193.json"), "utf8").then(JSON.parse)
  ]);
  const validation = validateDatasetDocument(document, expectedCountries);
  if (!validation.valid) {
    validation.errors.forEach((error) => console.error(error));
    throw new Error(`Dataset validation failed with ${validation.errors.length} errors`);
  }
  const summary = validation.summary;
  console.log(
    `valid dataset: ${summary.countries} countries; ${summary.ok} ok; ` +
    `${summary.routes} routes; ${summary.source_links} source links; minimum ${summary.minimum_sources} sources/country; ` +
    `${summary.digital_nomad_visas} digital-nomad visas ` +
    `(${summary.digital_nomad_visas_with_citizenship} citizenship yes, ` +
    `${summary.digital_nomad_visas_without_citizenship} no); categories: ` +
    `${summary.citizenship_categories.confirmed || 0} confirmed, ` +
    `${summary.citizenship_categories.temporary_only || 0} temporary, ` +
    `${summary.citizenship_categories.separate_profile_route || 0} separate-profile, ` +
    `${summary.citizenship_categories.unconfirmed || 0} unconfirmed, ` +
    `${summary.citizenship_categories.no_visa || 0} no-visa`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
