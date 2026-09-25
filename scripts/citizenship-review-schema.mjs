const flag = { type: ["boolean", "string"], enum: [true, false, "uncertain"] };
const list = { type: "array", items: { type: "string" } };
export const citizenshipReviewSchema = {
  type: ["object", "null"],
  additionalProperties: false,
  properties: {
    reviewed_route_names: list,
    status: { type: "string", enum: ["confirmed", "conditional", "unconfirmed", "not_available"] },
    qualifying_status: { type: ["string", "null"] },
    remote_work_profile_supported: flag,
    requires_status_switch: flag,
    requires_exit: flag,
    requires_permanent_residence: flag,
    nomad_time_counts_toward_citizenship: flag,
    years_to_citizenship: { type: ["number", "null"] },
    summary: { type: "string" },
    requirements: list,
    source_ids: list,
    citizenship_source_ids: list,
    reviewed_at: { type: "string" },
    notes: { type: "string" }
  },
  required: ["reviewed_route_names", "status", "qualifying_status", "remote_work_profile_supported", "requires_status_switch", "requires_exit", "requires_permanent_residence", "nomad_time_counts_toward_citizenship", "years_to_citizenship", "summary", "requirements", "source_ids", "citizenship_source_ids", "reviewed_at", "notes"]
};
