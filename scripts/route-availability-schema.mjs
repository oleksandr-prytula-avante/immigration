export const routeAvailabilitySchema = {
  type: ["object", "null"], additionalProperties: false,
  properties: {
    value: {type:"string", enum:["current","pending","not_available","unconfirmed"]},
    source_ids: {type:"array",items:{type:"string"}},
    notes: {type:"string"}
  }, required:["value","source_ids","notes"]
};
