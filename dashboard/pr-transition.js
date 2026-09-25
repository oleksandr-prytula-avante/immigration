import { digitalNomadVisaRoute, nomadRouteAvailability } from "./nomad-route.js";

const statuses = new Map([
  ["confirmed", { label: "YES", fullLabel: "Confirmed PR path", tone: "good", rank: 1 }],
  ["conditional", { label: "CND", fullLabel: "Conditional: additional eligibility required", tone: "info", rank: 2 }],
  ["unconfirmed", { label: "UNK", fullLabel: "Unconfirmed PR path", tone: "warn", rank: 3 }],
  ["not_available", { label: "NO", fullLabel: "PR path not available", tone: "bad", rank: 4 }]
]);

function validReviewShape(review) {
  if (!review || typeof review !== "object" || Array.isArray(review)) return false;
  const strings = value => Array.isArray(value) && value.every(item => typeof item === "string");
  const flag = value => [true, false, "uncertain"].includes(value);
  const date = typeof review.reviewed_at === "string" && /^\d{4}-\d{2}-\d{2}$/.test(review.reviewed_at)
    ? new Date(`${review.reviewed_at}T00:00:00Z`) : null;
  return strings(review.reviewed_route_names) && strings(review.requirements) && strings(review.source_ids) &&
    typeof review.summary === "string" && typeof review.notes === "string" && review.notes.trim() &&
    (review.qualifying_status === null || typeof review.qualifying_status === "string") &&
    ["direct_residence_clock", "status_switch", "separate_application", "no_permanent_residence", "uncertain"].includes(review.pathway_type) &&
    ["remote_work_profile_supported", "requires_status_switch", "requires_exit", "nomad_time_counts_toward_pr"].every(key => flag(review[key])) &&
    (review.years_to_pr === null || (typeof review.years_to_pr === "number" && Number.isFinite(review.years_to_pr) && review.years_to_pr >= 0)) &&
    date && Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === review.reviewed_at;
}

export function nomadPrTransition(data) {
  const route = digitalNomadVisaRoute(data);
  if (!route) return { status: "not_applicable", label: "N/A", tone: "neutral", rank: 5, summary: "No current nomad / remote-work route is recorded.", review: null };
  const review = data?.digital_nomad_pr_transition;
  const routeNames = [...(Array.isArray(data?.best_routes) ? data.best_routes : []),
    ...(Array.isArray(data?.rejected_routes) ? data.rejected_routes : [])].map(item => item?.route_name);
  const valid = validReviewShape(review) && statuses.has(review.status) &&
    (review.status !== "confirmed" || (nomadRouteAvailability(data) === "current" && review.remote_work_profile_supported === true &&
      typeof review.qualifying_status === "string" && review.qualifying_status.trim() &&
      ["direct_residence_clock", "status_switch", "separate_application"].includes(review.pathway_type))) &&
    (review.pathway_type !== "direct_residence_clock" || review.nomad_time_counts_toward_pr === true) &&
    (review.status !== "not_available" || review.years_to_pr === null) &&
    Array.isArray(review.reviewed_route_names) && review.reviewed_route_names.includes(route.route_name) &&
    new Set(review.reviewed_route_names).size === review.reviewed_route_names.length &&
    review.reviewed_route_names.every(name => routeNames.includes(name)) &&
    typeof review.summary === "string" && review.summary.trim() &&
    Array.isArray(review.source_ids) && review.source_ids.length > 0 &&
    review.source_ids.every(id => typeof id === "string" && Array.isArray(data.sources) && data.sources.some(source => {
      if (source?.id !== id) return false;
      try {
        const url = new URL(source.url);
        return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password;
      } catch { return false; }
    }));
  if (!valid) return { status: "unconfirmed", ...statuses.get("unconfirmed"), summary: "A cited review of the transition from this nomad route to permanent residence has not been recorded.", review: null };
  return { status: review.status, ...statuses.get(review.status), summary: review.summary, review };
}
