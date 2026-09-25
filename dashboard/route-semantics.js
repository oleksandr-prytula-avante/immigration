const DIGITAL_NOMAD_ROUTE_TYPES = new Set(["digital_nomad", "remote_worker"]);

export function digitalNomadVisaRoute(data) {
  const settlement = String(data?.settlement_track?.classification ?? "").toLowerCase();
  if (settlement.startsWith("not_valid")) return null;

  const bestRoutes = Array.isArray(data?.best_routes) ? data.best_routes : [];
  const nomadRoutes = bestRoutes.filter((item) => DIGITAL_NOMAD_ROUTE_TYPES.has(item?.route_type));
  // A current visa can exist even when it does not fit the applicant or lead to
  // settlement. Prefer the confirmed route when several nomad routes are listed.
  const bestRoute = nomadRoutes.find((item) =>
    item.valid_for_selection === true && hasCitedCitizenshipPath(data, item)
  ) ?? nomadRoutes.find((item) => item.valid_for_selection === true) ?? nomadRoutes[0];
  if (bestRoute) return bestRoute;

  const rejectedRoutes = Array.isArray(data?.rejected_routes) ? data.rejected_routes : [];
  return rejectedRoutes.find(isCurrentDedicatedNomadRoute) ?? null;
}

function isCurrentDedicatedNomadRoute(route) {
  if (!DIGITAL_NOMAD_ROUTE_TYPES.has(route?.route_type)) return false;

  const name = String(route?.route_name ?? "").toLowerCase();
  const positiveName = /digital[ -]?nomad|nomad|n[oôó]mad|remote[ -]work|remote worker|workcation|welcome stamp|work in nature|white card|premium visa|virtual work/.test(name);
  if (!positiveName) return false;

  const genericOrInactiveName = /^(dedicated|ordinary|no general|tourist|visitor visa)|under visitor status|visa-free|legacy|former|proposed|not operational/.test(name);
  if (genericOrInactiveName) return false;

  const validity = route?.initial_validity?.value;
  const hasCurrentStatusShape = route?.direct_temporary_residence_possible === true ||
    (typeof validity === "string" && validity.trim() !== "");
  return hasCurrentStatusShape;
}

export function hasDigitalNomadVisa(data) {
  return digitalNomadVisaRoute(data) !== null;
}

export function digitalNomadCitizenshipStatus(data) {
  if (!digitalNomadVisaRoute(data)) return "not_applicable";
  return digitalNomadCitizenshipRoute(data) ? "yes" : "no";
}

export function digitalNomadCitizenshipRoute(data) {
  const route = digitalNomadVisaRoute(data);
  if (!route) return null;

  const canLead = data?.settlement_track?.can_lead_to_citizenship_from_this_route;
  if (canLead !== true) return null;
  // The country settlement track may describe a separate residence route.
  // Never transfer that route's citizenship eligibility to the nomad visa.
  return route.valid_for_selection === true && hasCitedCitizenshipPath(data, route) ? route : null;
}

function hasCitedCitizenshipPath(data, route) {
  const path = route.path_to_citizenship;
  if (typeof path?.value !== "string" || !path.value.trim()) return false;
  if (!Array.isArray(path.source_ids) || path.source_ids.length === 0) return false;

  const sources = Array.isArray(data?.sources) ? data.sources : [];
  return path.source_ids.every((id) => typeof id === "string" && id.trim() && sources.some((source) => {
    if (source?.id !== id) return false;
    try {
      return ["http:", "https:"].includes(new URL(source.url).protocol);
    } catch {
      return false;
    }
  }));
}

export function digitalNomadCitizenshipCategory(data) {
  const route = digitalNomadVisaRoute(data);
  if (!route) return "no_visa";
  if (digitalNomadCitizenshipStatus(data) === "yes") return "confirmed";

  const canLead = data?.settlement_track?.can_lead_to_citizenship_from_this_route;
  if (route.valid_for_selection === "uncertain" ||
    (route.valid_for_selection === true && canLead === true) ||
    (route.valid_for_selection !== false && canLead !== true && canLead !== false)) {
    return "unconfirmed";
  }
  if (canLead === true) return "separate_profile_route";
  return "temporary_only";
}
