const booleanOrUncertain = { type: ["boolean", "string"], enum: [true, false, "uncertain"] };

// Nullable for countries without a current nomad route. Existing exports may omit it.
export const prTransitionSchema = {
  type: ["object", "null"],
  additionalProperties: false,
  properties: {
    reviewed_route_names: { type: "array", items: { type: "string" } },
    status: { type: "string", enum: ["confirmed", "conditional", "not_available", "unconfirmed"] },
    pathway_type: { type: "string", enum: ["direct_residence_clock", "status_switch", "separate_application", "no_permanent_residence", "uncertain"] },
    qualifying_status: { type: ["string", "null"] },
    remote_work_profile_supported: booleanOrUncertain,
    requires_status_switch: booleanOrUncertain,
    requires_exit: booleanOrUncertain,
    nomad_time_counts_toward_pr: booleanOrUncertain,
    years_to_pr: { type: ["number", "null"] },
    summary: { type: "string" },
    requirements: { type: "array", items: { type: "string" } },
    source_ids: { type: "array", items: { type: "string" } },
    reviewed_at: { type: "string" },
    notes: { type: "string" }
  },
  required: ["reviewed_route_names", "status", "pathway_type", "qualifying_status", "remote_work_profile_supported", "requires_status_switch", "requires_exit", "nomad_time_counts_toward_pr", "years_to_pr", "summary", "requirements", "source_ids", "reviewed_at", "notes"]
};
