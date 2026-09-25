const TYPES = new Set(["digital_nomad", "remote_worker"]);
const CURRENT_NAMES = /digital[ -]?nomad|nomad|n[oôó]mad|remote[ -]work|remote worker|workcation|welcome stamp|work in nature|white card|premium visa|virtual work/i;
const INACTIVE_NAMES = /^(dedicated|ordinary|no general|tourist|visitor visa)|under visitor status|visa-free|legacy|former|proposed|not operational/i;
const routes = data => [...(Array.isArray(data?.best_routes) ? data.best_routes : []), ...(Array.isArray(data?.rejected_routes) ? data.rejected_routes : [])].filter(route => TYPES.has(route?.route_type));

export function recordedRouteAvailability(data, route) {
  const review = route?.availability;
  if (review !== undefined) {
    if (!review || !["current", "pending", "not_available", "unconfirmed"].includes(review.value)) return "unconfirmed";
    if (review.value !== "current") return review.value;
    const cited = Array.isArray(review.source_ids) && review.source_ids.length && review.source_ids.every(id =>
      Array.isArray(data?.sources) && data.sources.some(source => {
        if (source?.id !== id) return false;
        try { const url = new URL(source.url); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password; } catch { return false; }
      }));
    return cited ? "current" : "unconfirmed";
  }
  // Backward-compatible imports lack an operational review; retain their captured
  // programme detection without deriving citizenship or PR from it.
  if (String(data?.settlement_track?.classification ?? "").startsWith("not_valid")) return "not_available";
  if (Array.isArray(data?.best_routes) && data.best_routes.includes(route)) return "current";
  const name = String(route?.route_name ?? "");
  const validity = route?.initial_validity?.value;
  return CURRENT_NAMES.test(name) && !INACTIVE_NAMES.test(name) &&
    (route.direct_temporary_residence_possible === true || (typeof validity === "string" && validity.trim())) ? "current" : "not_available";
}

export function digitalNomadVisaRoute(data) {
  const all = routes(data);
  const names = data?.digital_nomad_citizenship_review?.reviewed_route_names;
  for (const status of ["current", "unconfirmed"]) {
    const candidates = all.filter(route => recordedRouteAvailability(data, route) === status);
    const route = candidates.find(route => Array.isArray(names) && names.includes(route.route_name))
      ?? candidates.find(route => route.valid_for_selection === true) ?? candidates[0];
    if (route) return route;
  }
  return null;
}

export function nomadRouteAvailability(data) {
  const route = digitalNomadVisaRoute(data);
  if (route) return recordedRouteAvailability(data, route);
  return routes(data).some(route => recordedRouteAvailability(data, route) === "pending") ? "pending" : "not_available";
}

export function hasDigitalNomadVisa(data) { return nomadRouteAvailability(data) === "current"; }
export function hasRecordedNomadRoute(data) { return digitalNomadVisaRoute(data) !== null; }
