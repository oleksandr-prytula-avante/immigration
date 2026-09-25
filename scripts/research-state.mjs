import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { hasDigitalNomadVisa } from "../dashboard/route-semantics.js";
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
  if (state.meta.digital_nomad_pr_review) {
    const nomads = state.results.filter(item => item.status === "ok" && hasDigitalNomadVisa(item.data));
    const dates = nomads.map(item => item.data.digital_nomad_pr_transition?.reviewed_at);
    if (!nomads.length || dates.some(date => !validISODate(date))) {
      delete state.meta.digital_nomad_pr_review;
    } else {
      state.meta.digital_nomad_pr_review = {
        ...state.meta.digital_nomad_pr_review,
        countries: nomads.map(item => item.country),
        reviewed_at: dates.sort()[0],
        scope: `PR transitions for all ${nomads.length} current digital-nomad and equivalent remote-worker countries recorded in this dataset; individual reviews and other fields retain their own research dates.`
      };
    }
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
