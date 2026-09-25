import { digitalNomadVisaRoute, nomadRouteAvailability } from "./nomad-route.js";
import { nomadPrTransition } from "./pr-transition.js";

const statuses = new Map([
  ["confirmed", { label: "YES", fullLabel: "Confirmed citizenship path", tone: "good", rank: 1 }],
  ["conditional", { label: "CND", fullLabel: "Conditional citizenship: additional eligibility required", tone: "info", rank: 2 }],
  ["unconfirmed", { label: "UNK", fullLabel: "Citizenship path not established", tone: "warn", rank: 3 }],
  ["not_available", { label: "NO", fullLabel: "No supported citizenship path for this profile", tone: "bad", rank: 4 }],
  ["not_applicable", { label: "N/A", fullLabel: "No current nomad route", tone: "neutral", rank: 5 }]
]);

export function citizenshipReviewIssues(data, route = digitalNomadVisaRoute(data)) {
  const review = data?.digital_nomad_citizenship_review;
  const errors = [];
  if (!review || typeof review !== "object" || Array.isArray(review)) return ["requires a citizenship review"];
  if (!route) errors.push("requires a current nomad route");
  if (!["confirmed", "conditional", "unconfirmed", "not_available"].includes(review.status)) errors.push("has an invalid status");
  const nonempty = value => typeof value === "string" && value.trim();
  for (const field of ["summary", "notes"]) if (!nonempty(review[field])) errors.push(`${field} requires an explanation`);
  for (const field of ["remote_work_profile_supported", "requires_status_switch", "requires_exit", "requires_permanent_residence", "nomad_time_counts_toward_citizenship"]) {
    if (![true, false, "uncertain"].includes(review[field])) errors.push(`${field} requires a boolean or uncertain`);
  }
  if (review.qualifying_status !== null && !nonempty(review.qualifying_status)) errors.push("qualifying_status must be non-empty or null");
  const validDate = typeof review.reviewed_at === "string" && /^\d{4}-\d{2}-\d{2}$/.test(review.reviewed_at) && new Date(`${review.reviewed_at}T00:00:00Z`);
  if (!validDate || !Number.isFinite(validDate.valueOf()) || validDate.toISOString().slice(0, 10) !== review.reviewed_at) errors.push("reviewed_at must be a real calendar date");
  if (review.years_to_citizenship !== null && !(typeof review.years_to_citizenship === "number" && Number.isFinite(review.years_to_citizenship) && review.years_to_citizenship >= 0)) errors.push("years_to_citizenship must be nonnegative or null");
  const routes = [...(Array.isArray(data?.best_routes) ? data.best_routes : []), ...(Array.isArray(data?.rejected_routes) ? data.rejected_routes : [])];
  const names = routes.map(item => item?.route_name);
  for (const field of ["reviewed_route_names", "requirements", "source_ids", "citizenship_source_ids"]) {
    const list = review[field];
    if (!Array.isArray(list) || !list.length || list.some(value => !nonempty(value)) || new Set(list).size !== list.length) errors.push(`${field} requires distinct non-empty entries`);
  }
  if (!Array.isArray(review.reviewed_route_names) || !review.reviewed_route_names.includes(route?.route_name) || review.reviewed_route_names.some(name => !names.includes(name))) errors.push("reviewed_route_names must include the displayed existing nomad route");
  const sources = Array.isArray(data?.sources) ? data.sources : [];
  for (const id of Array.isArray(review.source_ids) ? review.source_ids : []) {
    const source = sources.find(item => item?.id === id);
    try {
      const url = new URL(source?.url);
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error();
    } catch { errors.push(`source_ids references missing or unsafe source ${id}`); }
  }
  if (Array.isArray(review.citizenship_source_ids) && review.citizenship_source_ids.some(id => !Array.isArray(review.source_ids) || !review.source_ids.includes(id))) errors.push("citizenship_source_ids must be included in the cited chain evidence");
  if (review.status === "confirmed") {
    if (nomadRouteAvailability(data) !== "current") errors.push("confirmed citizenship needs a current initial nomad route");
    if (review.remote_work_profile_supported !== true || !nonempty(review.qualifying_status)) errors.push("confirmed requires a complete path supporting foreign remote work");
    if (review.requires_permanent_residence === true && nomadPrTransition(data).status !== "confirmed") errors.push("confirmed citizenship requiring PR needs a confirmed compatible PR path");
  }
  if (review.status === "not_available" && review.years_to_citizenship !== null) errors.push("unavailable citizenship cannot have a numeric completion period");
  return errors;
}

export function nomadCitizenshipReview(data) {
  if (!digitalNomadVisaRoute(data)) return { status: "not_applicable", ...statuses.get("not_applicable"), summary: "No current nomad / remote-work route is recorded.", description: "No current nomad / remote-work route is recorded.", review: null };
  const review = data?.digital_nomad_citizenship_review;
  if (citizenshipReviewIssues(data).length) {
    const summary = "A complete cited citizenship chain for the foreign-remote-work profile has not been established. A separate PR application may still be available.";
    return { status: "unconfirmed", ...statuses.get("unconfirmed"), summary, description: summary, review: null };
  }
  return { status: review.status, ...statuses.get(review.status), summary: review.summary, description: review.summary, review };
}
