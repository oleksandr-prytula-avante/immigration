import OpenAI from "openai";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

await loadDotEnv();

const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-5.4-mini";
const DEFAULT_OUT = "dashboard/data/all-countries.json";

const args = parseArgs(process.argv.slice(2));
const model = args.model || DEFAULT_MODEL;
const outFile = args.out || DEFAULT_OUT;
const today = new Date().toISOString().slice(0, 10);

const root = path.dirname(new URL(import.meta.url).pathname);
const countriesPath = path.join(root, "countries.un-members-193.json");
const promptPath = path.join(root, "research_prompt.md");
const outputPath = path.resolve(root, outFile);

let client;
let promptTemplate;

async function main() {
  const countries = JSON.parse(await fs.readFile(countriesPath, "utf8"));
  promptTemplate = await fs.readFile(promptPath, "utf8");

  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === "replace_with_your_openai_api_key") {
    throw new Error("Missing OPENAI_API_KEY. Add your OpenAI API key to .env before running this script.");
  }

  client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });

  const selectedCountries = selectCountries(countries, args);
  const state = await loadState(outputPath);

  for (const country of selectedCountries) {
    if (state.results.some((item) => item.country === country && item.status === "ok") && !args.force) {
      console.log(`skip ${country}`);
      continue;
    }

    console.log(`research ${country}`);
    const startedAt = new Date().toISOString();

    try {
      const result = await researchCountry(country);
      upsertResult(state, {
        country,
        status: "ok",
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        data: result
      });
    } catch (error) {
      upsertResult(state, {
        country,
        status: "error",
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        error: serializeError(error)
      });
    }

    state.meta.updated_at = new Date().toISOString();
    await saveState(outputPath, state);
    await sleep(Number(args.delayMs ?? 1500));
  }

  console.log(`saved ${outputPath}`);
}

async function researchCountry(country) {
  const prompt = promptTemplate
    .replaceAll("{{COUNTRY}}", country)
    .replaceAll("{{TODAY}}", today);

  const response = await withRetries(() =>
    client.responses.create({
      model,
      reasoning: { effort: args.reasoningEffort || "medium" },
      tools: [{ type: "web_search" }],
      tool_choice: "auto",
      input: [
        {
          role: "system",
          content: [
            "You are a meticulous immigration, tax, and nationality-law research assistant.",
            "Use current web sources. Prefer official government sources and reputable primary indexes.",
            "Return only JSON matching the schema. Do not include markdown."
          ].join(" ")
        },
        {
          role: "user",
          content: prompt
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "country_immigration_research",
          strict: true,
          schema: countryResearchSchema
        }
      }
    })
  );

  return JSON.parse(response.output_text);
}

async function loadState(file) {
  try {
    const contents = await fs.readFile(file, "utf8");
    if (!contents.trim()) return createInitialState();
    return normalizeState(JSON.parse(contents));
  } catch (error) {
    if (error.code === "ENOENT") return createInitialState();
    if (error instanceof SyntaxError) {
      throw new Error(`Could not parse existing output JSON at ${file}: ${error.message}`);
    }
    throw error;
  }
}

function createInitialState() {
  return {
    meta: {
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      country_set: "193 UN member states",
      model
    },
    results: []
  };
}

function normalizeState(state) {
  const initialState = createInitialState();

  return {
    ...initialState,
    ...state,
    meta: {
      ...initialState.meta,
      ...(state && typeof state === "object" ? state.meta : null),
      model
    },
    results: Array.isArray(state?.results) ? state.results : []
  };
}

async function saveState(file, state) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(state, null, 2)}\n`);
}

function upsertResult(state, item) {
  const index = state.results.findIndex((result) => result.country === item.country);
  if (index >= 0) state.results[index] = item;
  else state.results.push(item);
}

function selectCountries(allCountries, parsedArgs) {
  let selected = [...allCountries];

  if (parsedArgs.country) {
    const wanted = parsedArgs.country.toLowerCase();
    selected = selected.filter((country) => country.toLowerCase() === wanted);
    if (selected.length === 0) {
      throw new Error(`Country not found in 193 UN member list: ${parsedArgs.country}`);
    }
  }

  if (parsedArgs.start) {
    const startIndex = selected.findIndex((country) => country.toLowerCase() === parsedArgs.start.toLowerCase());
    if (startIndex === -1) {
      throw new Error(`Start country not found: ${parsedArgs.start}`);
    }
    selected = selected.slice(startIndex);
  }

  if (parsedArgs.limit) {
    selected = selected.slice(0, Number(parsedArgs.limit));
  }

  return selected;
}

function parseArgs(argv) {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;

    const key = arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    const next = argv[index + 1];

    if (!next || next.startsWith("--")) {
      parsed[key] = true;
    } else {
      parsed[key] = next;
      index += 1;
    }
  }

  return parsed;
}

function serializeError(error) {
  return {
    name: error?.name || "Error",
    message: error?.message || String(error),
    status: error?.status || null,
    code: error?.code || null,
    cause: serializeCause(error?.cause)
  };
}

function serializeCause(cause) {
  if (!cause) return null;

  return {
    name: cause?.name || null,
    message: cause?.message || String(cause),
    code: cause?.code || null,
    errno: cause?.errno || null,
    syscall: cause?.syscall || null,
    hostname: cause?.hostname || null
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetries(operation) {
  const maxAttempts = Number(args.maxAttempts ?? 3);
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isRetryableError(error) || attempt === maxAttempts) break;

      const delayMs = Math.min(30000, 1000 * 2 ** (attempt - 1));
      console.warn(`retry ${attempt}/${maxAttempts} after ${error.message}; waiting ${delayMs}ms`);
      await sleep(delayMs);
    }
  }

  throw lastError;
}

function isRetryableError(error) {
  if (!error) return false;
  if (isQuotaError(error)) return false;
  if (error.status === 408 || error.status === 409 || error.status === 429 || error.status >= 500) return true;
  if (error.name === "APIConnectionError" || error.message === "Connection error.") return true;
  return ["ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN"].includes(error.code || error.cause?.code);
}

function isQuotaError(error) {
  const message = `${error?.message || ""} ${error?.code || ""}`.toLowerCase();
  return message.includes("exceeded your current quota") || message.includes("insufficient_quota");
}

async function loadDotEnv() {
  const envPath = path.join(path.dirname(new URL(import.meta.url).pathname), ".env");

  try {
    const contents = await fs.readFile(envPath, "utf8");

    for (const line of contents.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) continue;

      const key = trimmed.slice(0, separatorIndex).trim();
      const rawValue = trimmed.slice(separatorIndex + 1).trim();
      if (!key || process.env[key] !== undefined) continue;

      process.env[key] = rawValue.replace(/^(['"])(.*)\1$/, "$2");
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

const nullableString = { type: ["string", "null"] };
const nullableNumber = { type: ["number", "null"] };
const nullableBoolean = { type: ["boolean", "null"] };
const sourceIds = { type: "array", items: { type: "string" } };

const sourcedText = {
  type: "object",
  additionalProperties: false,
  properties: {
    value: nullableString,
    source_ids: sourceIds,
    notes: nullableString
  },
  required: ["value", "source_ids", "notes"]
};

const sourcedNumber = {
  type: "object",
  additionalProperties: false,
  properties: {
    value: nullableNumber,
    source_ids: sourceIds,
    notes: nullableString
  },
  required: ["value", "source_ids", "notes"]
};

const routeSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    route_name: { type: "string" },
    route_type: {
      type: "string",
      enum: [
        "digital_nomad",
        "remote_worker",
        "freelance_self_employed",
        "entrepreneur",
        "independent_professional",
        "points_based_or_talent",
        "education_based",
        "tourist_to_self_employed",
        "employer_sponsored",
        "other"
      ]
    },
    valid_for_selection: { type: ["boolean", "string"], enum: [true, false, "uncertain"] },
    independent_application_possible: nullableBoolean,
    local_employer_required: nullableBoolean,
    foreign_contract_or_income_required: nullableBoolean,
    direct_temporary_residence_possible: nullableBoolean,
    direct_permanent_residence_possible: nullableBoolean,
    minimum_monthly_income_usd: sourcedNumber,
    minimum_income_local_currency: sourcedText,
    income_proof_months: sourcedNumber,
    key_requirements: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          requirement: { type: "string" },
          source_ids: sourceIds
        },
        required: ["requirement", "source_ids"]
      }
    },
    initial_validity: sourcedText,
    extension_rules: sourcedText,
    path_to_temporary_residence: sourcedText,
    path_to_permanent_residence: sourcedText,
    path_to_citizenship: sourcedText,
    notes: nullableString,
    source_ids: sourceIds
  },
  required: [
    "route_name",
    "route_type",
    "valid_for_selection",
    "independent_application_possible",
    "local_employer_required",
    "foreign_contract_or_income_required",
    "direct_temporary_residence_possible",
    "direct_permanent_residence_possible",
    "minimum_monthly_income_usd",
    "minimum_income_local_currency",
    "income_proof_months",
    "key_requirements",
    "initial_validity",
    "extension_rules",
    "path_to_temporary_residence",
    "path_to_permanent_residence",
    "path_to_citizenship",
    "notes",
    "source_ids"
  ]
};

const countryResearchSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    country: { type: "string" },
    researched_at: { type: "string" },
    valid_for_selection: { type: ["boolean", "string"], enum: [true, false, "uncertain"] },
    selection_summary: nullableString,
    best_routes: { type: "array", items: routeSchema },
    rejected_routes: { type: "array", items: routeSchema },
    education_or_qualification_based_residence: {
      type: "object",
      additionalProperties: false,
      properties: {
        available_without_local_employer: nullableBoolean,
        gives_temporary_residence_directly: nullableBoolean,
        gives_permanent_residence_directly: nullableBoolean,
        summary: sourcedText
      },
      required: [
        "available_without_local_employer",
        "gives_temporary_residence_directly",
        "gives_permanent_residence_directly",
        "summary"
      ]
    },
    taxes: {
      type: "object",
      additionalProperties: false,
      properties: {
        tax_residency_rule: sourcedText,
        income_tax_rate_percent: sourcedNumber,
        social_contributions_percent: sourcedNumber,
        fixed_payments_usd_monthly: sourcedNumber,
        special_tax_regimes: sourcedText,
        caveats: nullableString
      },
      required: [
        "tax_residency_rule",
        "income_tax_rate_percent",
        "social_contributions_percent",
        "fixed_payments_usd_monthly",
        "special_tax_regimes",
        "caveats"
      ]
    },
    timeline: {
      type: "object",
      additionalProperties: false,
      properties: {
        years_to_temporary_residence: sourcedNumber,
        years_to_permanent_residence_after_temporary: sourcedNumber,
        years_to_citizenship_after_permanent_residence: sourcedNumber,
        total_years_to_citizenship: sourcedNumber,
        typical_citizenship_processing_time_months: sourcedNumber,
        key_conditions: sourcedText
      },
      required: [
        "years_to_temporary_residence",
        "years_to_permanent_residence_after_temporary",
        "years_to_citizenship_after_permanent_residence",
        "total_years_to_citizenship",
        "typical_citizenship_processing_time_months",
        "key_conditions"
      ]
    },
    marriage: {
      type: "object",
      additionalProperties: false,
      properties: {
        accelerates_citizenship_or_pr: nullableBoolean,
        years_of_marriage_or_residence_required: sourcedNumber,
        existing_marriage_effect: sourcedText,
        requirements_and_risks: sourcedText
      },
      required: [
        "accelerates_citizenship_or_pr",
        "years_of_marriage_or_residence_required",
        "existing_marriage_effect",
        "requirements_and_risks"
      ]
    },
    child_citizenship: {
      type: "object",
      additionalProperties: false,
      properties: {
        citizenship_principle: { type: "string", enum: ["jus_soli", "jus_sanguinis", "mixed", "uncertain"] },
        child_gets_citizenship_if_both_parents_migrants: nullableBoolean,
        child_gets_citizenship_if_one_parent_local_citizen: nullableBoolean,
        child_gets_citizenship_if_one_parent_permanent_resident: nullableBoolean,
        benefit_to_migrant_father: sourcedText
      },
      required: [
        "citizenship_principle",
        "child_gets_citizenship_if_both_parents_migrants",
        "child_gets_citizenship_if_one_parent_local_citizen",
        "child_gets_citizenship_if_one_parent_permanent_resident",
        "benefit_to_migrant_father"
      ]
    },
    passport: {
      type: "object",
      additionalProperties: false,
      properties: {
        index_name: nullableString,
        rank: sourcedNumber,
        visa_free_destinations: sourcedNumber,
        visa_required_destinations: sourcedNumber,
        visa_on_arrival_or_eta_destinations: sourcedNumber,
        notes: nullableString
      },
      required: [
        "index_name",
        "rank",
        "visa_free_destinations",
        "visa_required_destinations",
        "visa_on_arrival_or_eta_destinations",
        "notes"
      ]
    },
    languages: {
      type: "object",
      additionalProperties: false,
      properties: {
        official_languages: { type: "array", items: { type: "string" } },
        english_remote_work_practicality: sourcedText,
        russian_or_ukrainian_practicality: sourcedText
      },
      required: [
        "official_languages",
        "english_remote_work_practicality",
        "russian_or_ukrainian_practicality"
      ]
    },
    labor_market: {
      type: "object",
      additionalProperties: false,
      properties: {
        average_wage_usd_monthly: sourcedNumber,
        median_wage_usd_monthly: sourcedNumber,
        cost_of_living_note: sourcedText
      },
      required: ["average_wage_usd_monthly", "median_wage_usd_monthly", "cost_of_living_note"]
    },
    sources: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          url: { type: "string" },
          publisher: nullableString,
          source_type: {
            type: "string",
            enum: ["official_government", "law", "tax_authority", "passport_index", "statistics", "reputable_secondary", "other"]
          },
          accessed_at: { type: "string" }
        },
        required: ["id", "title", "url", "publisher", "source_type", "accessed_at"]
      }
    },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    notes: nullableString
  },
  required: [
    "country",
    "researched_at",
    "valid_for_selection",
    "selection_summary",
    "best_routes",
    "rejected_routes",
    "education_or_qualification_based_residence",
    "taxes",
    "timeline",
    "marriage",
    "child_citizenship",
    "passport",
    "languages",
    "labor_market",
    "sources",
    "confidence",
    "notes"
  ]
};

await main();
