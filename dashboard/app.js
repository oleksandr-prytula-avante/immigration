const state = {
  raw: null,
  rows: [],
  selectedCountry: null,
  sort: { key: "citizenship", direction: "asc" }
};

const elements = {
  file: document.querySelector("#jsonFile"),
  search: document.querySelector("#searchInput"),
  valid: document.querySelector("#validFilter"),
  citizenshipTrack: document.querySelector("#citizenshipTrackFilter"),
  fullyMatched: document.querySelector("#fullyMatchedFilter"),
  incomeMax: document.querySelector("#incomeMax"),
  taxMax: document.querySelector("#taxMax"),
  citizenshipMax: document.querySelector("#citizenshipMax"),
  rows: document.querySelector("#countryRows"),
  details: document.querySelector("#detailsPanel"),
  fileStatus: document.querySelector("#fileStatus"),
  visibleCount: document.querySelector("#visibleCount"),
  metricTotal: document.querySelector("#metricTotal"),
  metricValid: document.querySelector("#metricValid"),
  metricEligiblePath: document.querySelector("#metricEligiblePath"),
  metricAvgIncome: document.querySelector("#metricAvgIncome")
};

document.addEventListener("DOMContentLoaded", async () => {
  bindEvents();
  try {
    const demo = await fetch("./data/all-countries.json").then((response) => response.json());
    loadDataset(demo, "Demo JSON loaded. You can upload a result file.");
  } catch {
    elements.fileStatus.textContent = "Choose a result JSON file to build the dashboard.";
    render();
  }
});

function bindEvents() {
  elements.file.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const json = JSON.parse(await file.text());
      loadDataset(json, `Loaded file: ${file.name}`);
    } catch (error) {
      elements.fileStatus.textContent = `Could not read JSON: ${error.message}`;
    }
  });

  [elements.search, elements.valid, elements.citizenshipTrack, elements.fullyMatched, elements.incomeMax, elements.taxMax, elements.citizenshipMax].forEach((input) => {
    input.addEventListener("input", render);
  });

  document.querySelectorAll("th[data-sort]").forEach((header) => {
    header.addEventListener("click", () => {
      const key = header.dataset.sort;
      if (state.sort.key === key) {
        state.sort.direction = state.sort.direction === "asc" ? "desc" : "asc";
      } else {
        state.sort = { key, direction: "asc" };
      }
      render();
    });
  });
}

function loadDataset(json, statusText) {
  state.raw = json;
  state.rows = normalizeResults(json);
  state.selectedCountry = null;
  elements.fileStatus.textContent = statusText;
  render();
}

function normalizeResults(json) {
  const results = Array.isArray(json) ? json : json.results ?? [];

  return results.map((item) => {
    const data = item.data ?? item;
    const bestRoute = data.best_routes?.[0] ?? null;
    return {
      country: item.country ?? data.country ?? "Unknown",
      status: item.status ?? "ok",
      data,
      valid: data.valid_for_selection ?? "uncertain",
      confidence: data.confidence ?? null,
      summary: data.selection_summary ?? "",
      bestRouteName: bestRoute?.route_name ?? null,
      bestRouteType: bestRoute?.route_type ?? null,
      citizenshipTrack: data.settlement_track?.classification ?? "missing",
      languages: Array.isArray(data.languages?.official_languages) ? data.languages.official_languages : [],
      jusSoli: data.child_citizenship?.birthright_citizenship?.value ?? null,
      income: numberValue(bestRoute?.minimum_monthly_income_usd),
      incomeText: bestRoute?.income_requirement_display?.value ?? null,
      tax: numberValue(data.taxes?.income_tax_rate_percent),
      citizenshipYears: numberValue(data.timeline?.total_years_to_citizenship),
      sourceCount: data.sources?.length ?? 0,
      error: item.error ?? null
    };
  });
}

function render() {
  const rows = filteredRows().sort(compareRows);
  renderMetrics();
  renderTable(rows);
  renderDetails(rows);
  elements.visibleCount.textContent = rows.length;
}

function filteredRows() {
  const query = elements.search.value.trim().toLowerCase();
  const valid = elements.valid.value;
  const citizenshipTrack = elements.citizenshipTrack.value;
  const fullyMatched = elements.fullyMatched.checked;
  const incomeMax = parseOptionalNumber(elements.incomeMax.value);
  const taxMax = parseOptionalNumber(elements.taxMax.value);
  const citizenshipMax = parseOptionalNumber(elements.citizenshipMax.value);

  return state.rows.filter((row) => {
    const haystack = [
      row.country,
      row.summary,
      row.bestRouteName,
      row.bestRouteType,
      row.citizenshipTrack,
      citizenshipTrackLabel(row.citizenshipTrack),
      row.jusSoli,
      jusSoliLabel(row.jusSoli),
      row.languages.join(" "),
      row.data.notes
    ].join(" ").toLowerCase();

    if (query && !haystack.includes(query)) return false;
    if (valid !== "all" && String(row.valid) !== valid && row.status !== valid) return false;
    if (citizenshipTrack !== "all" && !matchesCitizenshipTrack(row.citizenshipTrack, citizenshipTrack)) return false;
    if (fullyMatched && !hasEligibleCitizenshipPath(row)) return false;
    if (incomeMax !== null && row.income !== null && row.income > incomeMax) return false;
    if (taxMax !== null && row.tax !== null && row.tax > taxMax) return false;
    if (citizenshipMax !== null && row.citizenshipYears !== null && row.citizenshipYears > citizenshipMax) return false;
    return true;
  });
}

function compareRows(a, b) {
  const direction = state.sort.direction === "asc" ? 1 : -1;
  const key = state.sort.key;
  if (key === "country") return compareCountries(a, b) * direction || compareCitizenshipYears(a, b);

  const valueA = sortValue(a, key);
  const valueB = sortValue(b, key);

  if (typeof valueA === "number" || typeof valueB === "number") {
    const numericResult = compareNullableNumbers(valueA, valueB) * direction;
    return numericResult || compareCountries(a, b) || compareTaxRates(a, b);
  }

  const stringResult = String(valueA ?? "").localeCompare(String(valueB ?? ""), "en") * direction;
  return stringResult || compareCountries(a, b);
}

function compareCountries(a, b) {
  return a.country.localeCompare(b.country, "en");
}

function compareCitizenshipYears(a, b) {
  return compareNullableNumbers(a.citizenshipYears, b.citizenshipYears);
}

function compareTaxRates(a, b) {
  return compareNullableNumbers(a.tax, b.tax);
}

function compareNullableNumbers(a, b) {
  return (a ?? Number.POSITIVE_INFINITY) - (b ?? Number.POSITIVE_INFINITY);
}

function sortValue(row, key) {
  if (key === "valid") return String(row.valid);
  if (key === "income") return row.income;
  if (key === "tax") return row.tax;
  if (key === "citizenship") return row.citizenshipYears;
  if (key === "citizenshipTrack") return citizenshipTrackRank(row.citizenshipTrack);
  if (key === "jusSoli") return jusSoliRank(row.jusSoli);
  return row.country;
}

function renderMetrics() {
  const okRows = state.rows.filter((row) => row.status === "ok");
  const validRows = okRows.filter((row) => row.valid === true);
  const eligiblePathRows = validRows.filter((row) => hasEligibleCitizenshipPath(row));
  const incomes = validRows.map((row) => row.income).filter((value) => value !== null);
  const avgIncome = incomes.length
    ? Math.round(incomes.reduce((sum, value) => sum + value, 0) / incomes.length)
    : null;

  elements.metricTotal.textContent = state.rows.length;
  elements.metricValid.textContent = validRows.length;
  elements.metricEligiblePath.textContent = eligiblePathRows.length;
  elements.metricAvgIncome.textContent = avgIncome === null ? "Not found" : money(avgIncome);
}

function renderTable(rows) {
  if (!rows.length) {
    elements.rows.innerHTML = '<tr><td colspan="9">No countries match the selected filters.</td></tr>';
    return;
  }

  elements.rows.innerHTML = rows.map((row, index) => `
    <tr class="${row.country === state.selectedCountry ? "active" : ""}" data-country="${escapeAttr(row.country)}">
      <td class="number-col">${index + 1}</td>
      <td>
        <span class="country-name">${escapeHtml(row.country)}</span>
        <span class="subtext">${escapeHtml(formatLanguages(row.languages))}</span>
        <span class="subtext">${escapeHtml(row.confidence ? `confidence: ${row.confidence}` : `${row.sourceCount} sources`)}</span>
      </td>
      <td class="status-col">${statusPill(row)}</td>
      <td>${escapeHtml(formatIncome(row))}</td>
      <td>${formatNullable(row.tax, (value) => `${value}%`)}</td>
      <td>${formatNullable(row.citizenshipYears, (value) => `${value} yrs`)}</td>
      <td>${jusSoliPill(row.jusSoli)}</td>
      <td>${citizenshipTrackPill(row.citizenshipTrack)}</td>
      <td class="route-col">
        ${escapeHtml(row.bestRouteName ?? "Not found")}
        <span class="subtext">${escapeHtml(row.bestRouteType ?? "")}</span>
      </td>
    </tr>
  `).join("");

  elements.rows.querySelectorAll("tr[data-country]").forEach((rowElement) => {
    rowElement.addEventListener("click", () => {
      state.selectedCountry = rowElement.dataset.country;
      render();
    });
  });
}

function renderDetails(visibleRows) {
  if (!state.selectedCountry) {
    elements.details.innerHTML = '<p class="empty">Select a country in the table to see details.</p>';
    return;
  }

  if (!visibleRows.some((item) => item.country === state.selectedCountry)) {
    state.selectedCountry = null;
    elements.details.innerHTML = '<p class="empty">Select a country in the table to see details.</p>';
    return;
  }

  const row = state.rows.find((item) => item.country === state.selectedCountry);
  if (!row) {
    state.selectedCountry = null;
    elements.details.innerHTML = '<p class="empty">Select a country in the table to see details.</p>';
    return;
  }

  if (row.status === "error") {
    elements.details.innerHTML = `
      <h2>${escapeHtml(row.country)}</h2>
      <p class="summary">The country request ended with an error.</p>
      <div class="detail-block">
        <h3>Error</h3>
        <p>${escapeHtml(row.error?.message ?? "Unknown error")}</p>
      </div>
    `;
    return;
  }

  const data = row.data;
  const route = data.best_routes?.[0];
  const sources = (data.sources ?? []).slice(0, 6);

  elements.details.innerHTML = `
    <h2>${escapeHtml(row.country)}</h2>
    <p class="summary">${escapeHtml(row.summary || "Summary is not filled in.")}</p>
    ${statusPill(row)}

    <div class="detail-block">
      <h3>Best Route</h3>
      <p>${escapeHtml(route?.route_name ?? "Not found")}</p>
      <p class="summary">${escapeHtml(route?.notes ?? route?.initial_validity?.value ?? "")}</p>
    </div>

    <div class="detail-block">
      <h3>Key Numbers</h3>
      <ul class="detail-list">
        <li>Income: ${escapeHtml(formatIncome(row))}</li>
        <li>Income proof: ${escapeHtml(formatIncomeProof(route))}</li>
        <li>Tax: ${formatNullable(row.tax, (value) => `${value}%`)}</li>
        <li>Citizenship timeline: ${formatNullable(row.citizenshipYears, (value) => `${value} yrs`)}</li>
      </ul>
    </div>

    <div class="detail-block">
      <h3>Taxation System</h3>
      <ul class="detail-list">
        <li>Rate type: ${escapeHtml(data.taxes?.taxation_system?.rate_type ?? "Not found")}</li>
        <li>Top/screening rate: ${formatNullable(data.taxes?.taxation_system?.top_personal_income_tax_rate_percent, (value) => `${value}%`)}</li>
        <li>Residence: ${escapeHtml(data.taxes?.taxation_system?.tax_residency_rule ?? "Not found")}</li>
        <li>Income scope: ${escapeHtml(data.taxes?.taxation_system?.income_scope ?? "Not found")}</li>
        <li>Special regimes: ${escapeHtml(data.taxes?.taxation_system?.special_regimes ?? "Not found")}</li>
        <li>Social/payroll: ${escapeHtml(data.taxes?.taxation_system?.social_security ?? "Not found")}</li>
      </ul>
      <p class="summary">${escapeHtml(data.taxes?.taxation_system?.notes ?? "")}</p>
    </div>

    <div class="detail-block">
      <h3>Digital Nomad Tax Detail</h3>
      <ul class="detail-list">
        <li>Route category: ${escapeHtml(data.taxes?.digital_nomad_taxation?.route_tax_category ?? "Not found")}</li>
        <li>Foreign income: ${escapeHtml(data.taxes?.digital_nomad_taxation?.foreign_income_treatment ?? "Not found")}</li>
        <li>Nomad/inbound regime: ${escapeHtml(data.taxes?.digital_nomad_taxation?.special_digital_nomad_or_inbound_regime ?? "Not found")}</li>
        <li>Social/payroll: ${escapeHtml(data.taxes?.digital_nomad_taxation?.social_security_and_payroll ?? "Not found")}</li>
        <li>Fixed payments: ${escapeHtml(data.taxes?.digital_nomad_taxation?.fixed_payments?.status ?? "Not found")}</li>
        <li>Fixed payment notes: ${escapeHtml(data.taxes?.digital_nomad_taxation?.fixed_payments?.notes ?? "Not found")}</li>
      </ul>
      <p class="summary">${escapeHtml(data.taxes?.digital_nomad_taxation?.notes ?? "")}</p>
    </div>

    <div class="detail-block">
      <h3>Transitions</h3>
      <ul class="detail-list">
        <li>Track: ${citizenshipTrackPill(row.citizenshipTrack)}</li>
        <li>Raw track: ${escapeHtml(data.settlement_track?.classification ?? "Not found")}</li>
        <li>Citizenship from this route: ${escapeHtml(formatCitizenshipTrack(data.settlement_track?.can_lead_to_citizenship_from_this_route))}</li>
      </ul>
      <p>${escapeHtml(data.timeline?.key_conditions?.value ?? "Not found.")}</p>
      <p class="summary">${escapeHtml(data.settlement_track?.summary ?? "")}</p>
    </div>

    <div class="detail-block">
      <h3>Marriage And Child</h3>
      <p>${escapeHtml(data.marriage?.requirements_and_risks?.value ?? "Not found.")}</p>
      <p class="summary">${escapeHtml(data.child_citizenship?.benefit_to_migrant_father?.value ?? "")}</p>
    </div>

    <div class="detail-block">
      <h3>Passport And Languages</h3>
      <ul class="detail-list">
        <li>Rank: ${formatNullable(numberValue(data.passport?.rank), (value) => `#${value}`)}</li>
        <li>Visa-free: ${formatNullable(numberValue(data.passport?.visa_free_destinations), (value) => `${value} destinations`)}</li>
        <li>Languages: ${escapeHtml((data.languages?.official_languages ?? []).join(", ") || "Not found")}</li>
      </ul>
    </div>

    <div class="detail-block">
      <h3>Sources</h3>
      <div class="sources">
        ${sources.length ? sources.map((source) => `
          <a href="${escapeAttr(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.title || source.url)}</a>
        `).join("") : '<p class="empty">No sources listed.</p>'}
      </div>
    </div>
  `;
}

function statusPill(row) {
  if (row.status === "error") return '<span class="pill bad">error</span>';
  if (row.valid === true) return '<span class="pill good">eligible</span>';
  if (row.valid === "uncertain") return '<span class="pill warn">review</span>';
  return '<span class="pill bad">not eligible</span>';
}

function matchesCitizenshipTrack(actual, selected) {
  if (selected === "not_valid") return String(actual).startsWith("not_valid");
  return actual === selected;
}

function hasEligibleCitizenshipPath(row) {
  return row.valid === true && row.data?.regular_foreign_contract_remote_work_fit?.value !== false && (
    row.citizenshipTrack === "strong_citizenship_track" ||
    row.citizenshipTrack === "possible_with_conversion"
  );
}

function citizenshipTrackRank(value) {
  if (value === "strong_citizenship_track") return 1;
  if (value === "possible_with_conversion") return 2;
  if (value === "weak_or_uncertain_citizenship_track") return 3;
  if (value === "temporary_nomad_only") return 4;
  if (String(value).startsWith("not_valid")) return 5;
  return 6;
}

function citizenshipTrackLabel(value) {
  if (value === "strong_citizenship_track") return "Strong";
  if (value === "possible_with_conversion") return "Conversion needed";
  if (value === "weak_or_uncertain_citizenship_track") return "Weak / uncertain";
  if (value === "temporary_nomad_only") return "Nomad only";
  if (String(value).startsWith("not_valid")) return "Not valid";
  return "Not found";
}

function citizenshipTrackTone(value) {
  if (value === "strong_citizenship_track") return "good";
  if (value === "possible_with_conversion") return "info";
  if (value === "weak_or_uncertain_citizenship_track") return "warn";
  if (value === "temporary_nomad_only") return "neutral";
  if (String(value).startsWith("not_valid")) return "bad";
  return "neutral";
}

function citizenshipTrackPill(value) {
  return `<span class="pill ${citizenshipTrackTone(value)}">${escapeHtml(citizenshipTrackLabel(value))}</span>`;
}

function jusSoliRank(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized.includes("unconditional")) return 1;
  if (normalized.includes("birthright") || normalized.includes("jus_soli")) return 2;
  if (normalized.includes("conditional") || normalized.includes("restricted") || normalized.includes("limited")) return 3;
  if (normalized.includes("sanguinis")) return 4;
  return 5;
}

function jusSoliLabel(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized.includes("unconditional")) return "Yes";
  if (normalized.includes("birthright")) return "Yes / exceptions";
  if (normalized.includes("conditional")) return "Conditional";
  if (normalized.includes("restricted") || normalized.includes("limited")) return "Limited";
  if (normalized.includes("sanguinis")) return "No";
  return "Not found";
}

function jusSoliTone(value) {
  const rank = jusSoliRank(value);
  if (rank === 1 || rank === 2) return "good";
  if (rank === 3) return "warn";
  if (rank === 4) return "neutral";
  return "neutral";
}

function jusSoliPill(value) {
  return `<span class="pill ${jusSoliTone(value)}">${escapeHtml(jusSoliLabel(value))}</span>`;
}

function numberValue(sourcedValue) {
  if (typeof sourcedValue === "number") return sourcedValue;
  if (typeof sourcedValue?.value === "number") return sourcedValue.value;
  return null;
}

function parseOptionalNumber(value) {
  if (value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatNullable(value, formatter) {
  return value === null || value === undefined ? "Not found" : formatter(value);
}

function formatIncome(row) {
  if (row.income !== null && row.income !== undefined) return `${money(row.income)} / mo`;
  return row.incomeText || "Not found";
}

function formatIncomeProof(route) {
  const months = numberValue(route?.income_proof_months);
  if (months !== null) return `${months} mo`;
  return route?.income_proof_months?.display_value || route?.income_proof_months?.value || "Not found";
}

function formatLanguages(languages) {
  return languages.length ? `Languages: ${languages.join(", ")}` : "Languages: Not found";
}

function formatCitizenshipTrack(value) {
  if (value === true) return "yes, if conditions are met";
  if (value === false) return "no, another status is required";
  if (value === "uncertain") return "unclear / conversion needed";
  return "Not found";
}

function money(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}
