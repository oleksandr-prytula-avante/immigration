import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { normalizeUrl, validateDatasetDocument } from "./validate-dataset.mjs";
import { assertResearchState, refreshResearchMetadata, saveResearchState } from "./research-state.mjs";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const args = parseArgs(process.argv.slice(2));
const countriesPath = path.join(root, "countries.un-members-193.json");
const datasetPath = path.resolve(root, args.out || "dashboard/data/all-countries.json");
const schemaPath = path.resolve(root, args.schema || "scripts/country-research.schema.json");
const runDirectory = path.resolve(root, args.runDir || ".research-runs");
const today = args.date || new Date().toISOString().slice(0, 10);
const concurrency = Math.max(1, Number(args.concurrency || 1));
const maxAttempts = Math.max(1, Number(args.maxAttempts || 3));
let minimumSources = Math.max(10, Number(args.minimumSources || 15));

async function main() {
  const allCountries = JSON.parse(await fs.readFile(countriesPath, "utf8"));
  const existingDataset = await loadDataset();
  minimumSources = Math.max(minimumSources, existingDataset.meta?.minimum_distinct_source_urls_per_country ?? 15);
  let selectedCountries = selectCountries(allCountries, args);
  if (args.onlyUnresolved) {
    const dataset = await loadDataset();
    const unresolvedCountries = new Set(
      dataset.results
        .filter((item) => findUnresolvedPaths(item.data).length > 0)
        .map((item) => item.country)
    );
    selectedCountries = selectedCountries.filter((country) => unresolvedCountries.has(country));
  }
  if (args.onlyUnexplainedNulls) {
    const dataset = await loadDataset();
    const incompleteCountries = new Set(
      dataset.results
        .filter((item) => findUnexplainedNullPaths(item.data).length > 0)
        .map((item) => item.country)
    );
    selectedCountries = selectedCountries.filter((country) => incompleteCountries.has(country));
  }
  if (selectedCountries.length === 0) {
    console.log("No countries selected; dataset unchanged");
    return;
  }
  await fs.mkdir(runDirectory, { recursive: true });

  console.log(
    `research queue: ${selectedCountries.length} countries; concurrency=${concurrency}; ` +
    `minimumSources=${minimumSources}; date=${today}`
  );

  let nextIndex = 0;
  let failures = 0;

  async function worker(workerNumber) {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= selectedCountries.length) return;

      const country = selectedCountries[index];
      try {
        await researchAndMergeCountry(country, index + 1, selectedCountries.length, workerNumber);
      } catch (error) {
        failures += 1;
        console.error(`failed ${country}: ${error.message}`);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, (_, index) => worker(index + 1)));

  if (failures > 0) {
    throw new Error(`${failures} countries failed after ${maxAttempts} attempts; rerun to retry checkpoints`);
  }

  const finalDataset = await loadDataset();
  const fullRun = selectedCountries.length === allCountries.length;
  const finalAudit = fullRun
    ? auditDataset(finalDataset, allCountries)
    : auditDataset(
        {
          results: finalDataset.results.filter((item) => selectedCountries.includes(item.country))
        },
        selectedCountries
      );
  if (finalAudit.errors.length > 0) {
    throw new Error(`final audit failed:\n${finalAudit.errors.join("\n")}`);
  }

  finalDataset.meta = {
    ...(finalDataset.meta || {}),
    updated_at: new Date().toISOString(),
    total_countries: allCountries.length,
    completed_countries: finalDataset.results.filter((item) => item.status === "ok").length,
    research_mode: "Codex CLI chats with current web research and JSON-schema validation",
    minimum_distinct_source_urls_per_country: fullRun ? minimumSources : finalDataset.meta?.minimum_distinct_source_urls_per_country ?? minimumSources
  };
  refreshResearchMetadata(finalDataset, allCountries, fullRun ? today : undefined);
  await saveDataset(finalDataset);
  console.log(`complete: ${selectedCountries.length} countries processed; selected-country audit passed`);
}

async function researchAndMergeCountry(country, position, total, workerNumber) {
  const safeName = country.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  const resultPath = path.join(runDirectory, `${safeName}.json`);
  const logPath = path.join(runDirectory, `${safeName}.log`);
  const datasetBeforeResearch = await loadDataset();
  const previousData = datasetBeforeResearch.results.find((item) => item.country === country)?.data || null;
  const targetPaths = args.onlyUnexplainedNulls
    ? findUnexplainedNullPaths(previousData)
    : findUnresolvedPaths(previousData);
  const previousUrls = uniqueUrls(previousData || { sources: [] });

  if (!args.force && !args.onlyUnresolved && !args.onlyUnexplainedNulls) {
    const checkpoint = await readValidCheckpoint(resultPath, country, (await fs.stat(datasetPath)).mtimeMs);
    if (checkpoint) {
      await mergeCountry(country, checkpoint);
      console.log(`[${position}/${total}] worker ${workerNumber}: checkpoint ${country}`);
      return;
    }
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    console.log(`[${position}/${total}] worker ${workerNumber}: research ${country} (attempt ${attempt})`);
    try {
      await fs.rm(resultPath, { force: true });
      await runCodex(country, resultPath, logPath, targetPaths, previousUrls);
      const result = JSON.parse(await fs.readFile(resultPath, "utf8"));
      validateCountryResult(country, result);
      if (args.onlyUnresolved || args.onlyUnexplainedNulls) {
        const previousUrlSet = new Set(previousUrls);
        const additionalUrls = uniqueUrls(result).filter((url) => !previousUrlSet.has(url));
        if (additionalUrls.length < 5) {
          throw new Error(`${additionalUrls.length} additional source URLs; 5 required for focused unresolved audit`);
        }
      }
      if (args.onlyUnexplainedNulls) {
        const remainingNullIssues = findUnexplainedNullPaths(result);
        if (remainingNullIssues.length > 0) {
          throw new Error(`unexplained or uncited null paths remain: ${remainingNullIssues.slice(0, 10).join(", ")}`);
        }
      }
      await mergeCountry(country, result);
      console.log(`[${position}/${total}] worker ${workerNumber}: saved ${country} (${uniqueUrls(result).length} URLs)`);
      return;
    } catch (error) {
      console.warn(`[${position}/${total}] invalid ${country}: ${error.message}`);
      if (attempt === maxAttempts) throw error;
    }
  }
}

async function runCodex(country, resultPath, logPath, unresolvedPaths, previousUrls) {
  const prompt = [
    `Research ${country} now.`,
    `Read research_prompt.md in full and follow it exactly, replacing {{COUNTRY}} with ${country} and {{TODAY}} with ${today}.`,
    `Read the existing ${country} record from ${datasetPath} under .results[] and audit/improve it as PREVIOUS COUNTRY RESULT.`,
    `Use current web research and inspect at least ${minimumSources} distinct, directly relevant URLs in total.`,
    "Resolve every gap you can through focused searches, prefer official primary sources, and keep cautious explained nulls when a fact genuinely cannot be established.",
    "Every source_ids entry must match an id in sources, and every sources item must use a distinct canonical URL.",
    ...(args.onlyUnresolved ? [
      `This is a focused unresolved-field pass. The exact flagged paths are: ${unresolvedPaths.join(", ")}.`,
      `Inspect at least 5 relevant URLs not present in the previous source set. The previous canonical URLs are: ${previousUrls.join(" | ")}.`,
      "Try targeted searches for every flagged path. Do not merely delete cautious information or invent a value.",
      "When an exact statistic or rule genuinely is not published or is not applicable, keep the numeric value null where appropriate, cite the sources checked, and replace vague markers such as 'Not found', 'Not confirmed', 'No data', or 'unable to confirm' with a precise factual explanation of what is unpublished, inapplicable, discretionary, or unavailable from the named current sources."
    ] : []),
    ...(args.onlyUnexplainedNulls ? [
      `This is a focused unexplained-null pass. The exact flagged paths are: ${unresolvedPaths.join(", ")}.`,
      `Inspect at least 5 relevant URLs not present in the previous source set. The previous canonical URLs are: ${previousUrls.join(" | ")}.`,
      "For every flagged sourced object whose value remains null, provide precise non-empty notes and at least one valid source_id showing which relevant source was checked. Fill a factual value when current authoritative evidence supports it; otherwise preserve null and explain why the measure is unpublished, inapplicable, discretionary, or unavailable.",
      "Do not leave any sourced value:null object anywhere in the replacement record with empty notes or an empty source_ids array."
    ] : []),
    "Return only the complete country JSON object matching the supplied output schema. Do not edit repository files."
  ].join(" ");

  const codexArgs = [
    "exec",
    "--ephemeral",
    "-C", root,
    "-s", "read-only",
    "--color", "never",
    "--output-schema", schemaPath,
    "-o", resultPath
  ];
  if (args.model) codexArgs.push("--model", args.model);
  codexArgs.push(prompt);

  const logHandle = await fs.open(logPath, "w");
  try {
    await new Promise((resolve, reject) => {
      const child = spawn("codex", codexArgs, {
        cwd: root,
        stdio: ["ignore", logHandle.fd, logHandle.fd]
      });
      child.once("error", reject);
      child.once("exit", (code, signal) => {
        if (code === 0) resolve();
        else reject(new Error(`Codex exited with code ${code ?? "null"}${signal ? ` (${signal})` : ""}; see ${logPath}`));
      });
    });
  } finally {
    await logHandle.close();
  }
}

export async function readValidCheckpoint(file, country, minimumModifiedAt = 0) {
  try {
    if ((await fs.stat(file)).mtimeMs < minimumModifiedAt) return null;
    const result = JSON.parse(await fs.readFile(file, "utf8"));
    validateCountryResult(country, result);
    return result;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    console.warn(`ignoring invalid checkpoint for ${country}: ${error.message}`);
    return null;
  }
}

export function validateCountryResult(country, result, options = {}) {
  const validation = validateDatasetDocument({ results: [{ country, status: "ok", data: result }] }, [country], {
    minimumSources: options.minimumSources ?? minimumSources,
    requireNomadPrReview: true
  });
  if (!validation.valid) throw new Error(validation.errors.join("\n"));
  if (result.researched_at !== (options.researchDate ?? today)) {
    throw new Error(`${country}: researched_at must match the requested research date`);
  }
}

function uniqueUrls(result) {
  return [...new Set((result.sources || []).map((source) => normalizeUrl(source.url)).filter(Boolean))];
}

function findUnresolvedPaths(value, currentPath = "", found = []) {
  const marker = /\b(not[ _-]?found|not[ _-]?confirmed|no data|not researched|not_confirmed_in_dataset|unable to confirm|could not confirm)\b/i;
  if (typeof value === "string" && marker.test(value)) {
    found.push(currentPath || "$");
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => findUnresolvedPaths(item, `${currentPath}[${index}]`, found));
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      findUnresolvedPaths(item, currentPath ? `${currentPath}.${key}` : key, found);
    }
  }
  return found;
}

function findUnexplainedNullPaths(value, currentPath = "", found = []) {
  if (!value || typeof value !== "object") return found;
  if (!Array.isArray(value) && Object.prototype.hasOwnProperty.call(value, "value") && value.value === null) {
    const notes = typeof value.notes === "string" ? value.notes.trim() : "";
    const ids = Array.isArray(value.source_ids) ? value.source_ids : [];
    if (!notes || ids.length === 0) found.push(currentPath || "$");
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => findUnexplainedNullPaths(item, `${currentPath}[${index}]`, found));
  } else {
    for (const [key, item] of Object.entries(value)) {
      findUnexplainedNullPaths(item, currentPath ? `${currentPath}.${key}` : key, found);
    }
  }
  return found;
}

let mergeQueue = Promise.resolve();

async function mergeCountry(country, data) {
  const pendingMerge = mergeQueue.then(async () => {
    const dataset = await loadDataset();
    const index = dataset.results.findIndex((item) => item.country === country);
    const previous = index >= 0 ? dataset.results[index] : null;
    const item = {
      country,
      status: "ok",
      started_at: previous?.started_at || new Date().toISOString(),
      finished_at: new Date().toISOString(),
      data
    };
    if (index >= 0) dataset.results[index] = item;
    else dataset.results.push(item);
    const allCountries = JSON.parse(await fs.readFile(countriesPath, "utf8"));
    refreshResearchMetadata(dataset, allCountries);
    await saveDataset(dataset);
  });
  mergeQueue = pendingMerge.catch(() => {});
  return pendingMerge;
}

async function loadDataset() {
  const dataset = JSON.parse(await fs.readFile(datasetPath, "utf8"));
  return assertResearchState(dataset);
}

async function saveDataset(dataset) {
  await saveResearchState(datasetPath, dataset);
}

function auditDataset(dataset, expectedCountries) {
  const errors = [];
  const names = dataset.results.map((item) => item.country);
  const missing = expectedCountries.filter((country) => !names.includes(country));
  const duplicates = names.filter((country, index) => names.indexOf(country) !== index);
  if (missing.length) errors.push(`missing countries: ${missing.join(", ")}`);
  if (duplicates.length) errors.push(`duplicate countries: ${[...new Set(duplicates)].join(", ")}`);
  for (const item of dataset.results) {
    try {
      validateCountryResult(item.country, item.data);
    } catch (error) {
      errors.push(`${item.country}: ${error.message}`);
    }
  }
  return { errors };
}

function selectCountries(countries, parsedArgs) {
  let selected = [...countries];
  if (parsedArgs.country) {
    selected = selected.filter((country) => country.toLowerCase() === String(parsedArgs.country).toLowerCase());
    if (!selected.length) throw new Error(`country not found: ${parsedArgs.country}`);
  }
  if (parsedArgs.start) {
    const index = selected.findIndex((country) => country.toLowerCase() === String(parsedArgs.start).toLowerCase());
    if (index < 0) throw new Error(`start country not found: ${parsedArgs.start}`);
    selected = selected.slice(index);
  }
  if (parsedArgs.limit) selected = selected.slice(0, Number(parsedArgs.limit));
  return selected;
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) continue;
    const key = argument.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) parsed[key] = true;
    else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main();
}
