import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  digitalNomadCitizenshipCategory,
  digitalNomadCitizenshipRoute,
  digitalNomadCitizenshipStatus,
  digitalNomadVisaRoute,
  hasDigitalNomadVisa
} from "../dashboard/route-semantics.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function validateDatasetDocument(document, expectedCountries, options = {}) {
  const errors = [];
  const results = Array.isArray(document?.results) ? document.results : [];
  const minimumSources = Number(
    options.minimumSources ?? document?.meta?.minimum_distinct_source_urls_per_country ?? 15
  );
  const names = results.map((item) => item?.country);

  if (results.length !== expectedCountries.length) {
    errors.push(`Expected ${expectedCountries.length} results, found ${results.length}`);
  }

  const duplicateNames = duplicates(names);
  const missingNames = expectedCountries.filter((country) => !names.includes(country));
  const extraNames = names.filter((country) => !expectedCountries.includes(country));
  if (duplicateNames.length) errors.push(`Duplicate countries: ${duplicateNames.join(", ")}`);
  if (missingNames.length) errors.push(`Missing countries: ${missingNames.join(", ")}`);
  if (extraNames.length) errors.push(`Unexpected countries: ${extraNames.join(", ")}`);

  for (const item of results) validateCountry(item, minimumSources, errors);

  const digitalNomadVisas = results.filter((item) => hasDigitalNomadVisa(item?.data));
  const citizenshipStatuses = digitalNomadVisas.reduce((counts, item) => {
    const status = digitalNomadCitizenshipStatus(item?.data);
    counts[status] = (counts[status] || 0) + 1;
    return counts;
  }, {});
  const citizenshipCategories = results.reduce((counts, item) => {
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
        (sum, item) => sum + (item?.data?.best_routes?.length || 0) + (item?.data?.rejected_routes?.length || 0),
        0
      ),
      source_links: results.reduce((sum, item) => sum + (item?.data?.sources?.length || 0), 0),
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
    return;
  }
  if (data.country !== country) errors.push(`${country}: data.country does not match wrapper country`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.researched_at || "")) {
    errors.push(`${country}: researched_at must be YYYY-MM-DD`);
  }

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
    if (!source?.id) errors.push(`${country}: sources[${index}].id is empty`);
    if (!normalizeUrl(source?.url)) errors.push(`${country}: sources[${index}].url is invalid`);
    if (!source?.title) errors.push(`${country}: sources[${index}].title is empty`);
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

  if (digitalNomadCitizenshipStatus(data) === "yes") {
    const citizenshipRoute = digitalNomadCitizenshipRoute(data);
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

function normalizeUrl(value) {
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol)) return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
    }
    return url.toString().replace(/\/$/, "");
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
