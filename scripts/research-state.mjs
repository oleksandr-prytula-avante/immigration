import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { hasRecordedNomadRoute } from "../dashboard/route-semantics.js";
import { validISODate } from "./validate-dataset.mjs";

export function assertResearchState(state) {
  if (!state || typeof state !== "object" || Array.isArray(state) || !Array.isArray(state.results)) {
    throw new Error("Existing research JSON must be an object with a results array");
  }
  if (state.results.some(item => !item || typeof item.country !== "string")) {
    throw new Error("Existing research JSON contains an invalid country record");
  }
  return state;
}

export function refreshResearchMetadata(state, expectedCountries, fullResearchDate) {
  assertResearchState(state);
  const completed = new Set(state.results.filter(item => item.status === "ok").map(item => item.country));
  state.meta = {
    ...(state.meta || {}),
    updated_at: new Date().toISOString(),
    total_countries: expectedCountries.length,
    completed_countries: state.results.filter(item => item.status === "ok").length,
    status: expectedCountries.every(country => completed.has(country)) ? "complete" : "in_progress",
    ...(fullResearchDate ? { last_full_research_date: fullResearchDate } : {})
  };
  // A partial refresh cannot claim that all PR reviews were performed today.
  for (const [metaKey, dataKey, label] of [
    ["digital_nomad_pr_review", "digital_nomad_pr_transition", "PR transitions"],
    ["digital_nomad_citizenship_review", "digital_nomad_citizenship_review", "Citizenship chains"]
  ]) {
    if (!state.meta[metaKey]) continue;
    const nomads = state.results.filter(item => item.status === "ok" && hasRecordedNomadRoute(item.data));
    const dates = nomads.map(item => item.data[dataKey]?.reviewed_at);
    if (!nomads.length || dates.some(date => !validISODate(date))) {
      delete state.meta[metaKey];
    } else {
      state.meta[metaKey] = {
        ...state.meta[metaKey],
        countries: nomads.map(item => item.country),
        reviewed_at: dates.sort()[0],
        scope: `${label} for all ${nomads.length} current or availability-unconfirmed digital-nomad and equivalent remote-worker countries recorded in this dataset; individual reviews and other fields retain their own research dates.`
      };
    }
  }
  if (state.meta.digital_nomad_availability_review) {
    const typedRoutes = state.results.filter(item => item.status === "ok").flatMap(item =>
      [...(item.data?.best_routes || []), ...(item.data?.rejected_routes || [])]
        .filter(route => ["digital_nomad", "remote_worker"].includes(route.route_type)).map(route => ({country:item.country, route})));
    if (typedRoutes.some(item => !item.route.availability)) delete state.meta.digital_nomad_availability_review;
    else Object.assign(state.meta.digital_nomad_availability_review, {
      route_count: typedRoutes.length,
      countries: [...new Set(typedRoutes.map(item => item.country))].sort()
    });
  }
  return state;
}

export async function saveResearchState(file, state) {
  assertResearchState(state);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { flag: "wx" });
    await fs.rename(temporary, file);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}
