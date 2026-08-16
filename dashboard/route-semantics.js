const DIGITAL_NOMAD_ROUTE_TYPES = new Set(["digital_nomad", "remote_worker"]);

export function digitalNomadVisaRoute(data) {
  const remoteWorkFit = data?.regular_foreign_contract_remote_work_fit?.value;
  const settlement = String(data?.settlement_track?.classification ?? "").toLowerCase();
  if (settlement.startsWith("not_valid")) return null;

  const bestRoutes = Array.isArray(data?.best_routes) ? data.best_routes : [];
  const bestRoute = bestRoutes.find((item) => DIGITAL_NOMAD_ROUTE_TYPES.has(item?.route_type));
  if (bestRoute && remoteWorkFit !== false) return bestRoute;

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
  if (route.valid_for_selection === true) return route;

  if (data?.regular_foreign_contract_remote_work_fit?.value !== true) return null;
  return (data?.best_routes || []).find((candidate) =>
      candidate?.valid_for_selection === true &&
      candidate?.direct_permanent_residence_possible === true &&
      candidate?.local_employer_required !== true
    ) ?? null;
}
