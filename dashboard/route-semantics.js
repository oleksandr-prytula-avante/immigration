import { digitalNomadVisaRoute } from "./nomad-route.js";
import { nomadCitizenshipReview } from "./citizenship-review.js";
export { digitalNomadVisaRoute, hasDigitalNomadVisa, hasRecordedNomadRoute, nomadRouteAvailability } from "./nomad-route.js";

// Compatibility helpers use the same reviewed chain as the UI and importer.
export function digitalNomadCitizenshipStatus(data) {
  const { status } = nomadCitizenshipReview(data);
  return status === "confirmed" ? "yes" : status === "not_available" ? "no" : status;
}

export function digitalNomadCitizenshipRoute(data) {
  return nomadCitizenshipReview(data).status === "confirmed" ? digitalNomadVisaRoute(data) : null;
}

export function digitalNomadCitizenshipCategory(data) {
  const { status } = nomadCitizenshipReview(data);
  return status === "not_applicable" ? "no_visa" : status;
}
