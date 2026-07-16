const state = {
  raw: null,
  rows: [],
  selectedCountry: null,
  sort: { key: "citizenship", direction: "asc" },
  pendingUrlState: null,
  isRestoringUrlState: false
};

const elements = {
  file: document.querySelector("#jsonFile"),
  search: document.querySelector("#searchInput"),
  valid: document.querySelector("#validFilter"),
  language: document.querySelector("#languageFilter"),
  citizenshipTrack: document.querySelector("#citizenshipTrackFilter"),
  jusSoli: document.querySelector("#jusSoliFilter"),
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
  state.pendingUrlState = readUrlState();
  applyUrlStateBeforeData();
  bindEvents();
  try {
    const demo = await fetch("./data/all-countries.json").then((response) => response.json());
    loadDataset(demo, "DEMO JSON LOADED. YOU CAN UPLOAD A RESULT FILE.");
  } catch {
    elements.fileStatus.textContent = "CHOOSE A RESULT JSON FILE TO BUILD THE DASHBOARD.";
    render();
  }
});

function bindEvents() {
  elements.file.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const json = JSON.parse(await file.text());
      loadDataset(json, `LOADED FILE: ${file.name}`);
    } catch (error) {
      elements.fileStatus.textContent = `COULD NOT READ JSON: ${error.message}`;
    }
  });

  const resettableFilters = [
    elements.search,
    elements.valid,
    elements.language,
    elements.citizenshipTrack,
    elements.jusSoli,
    elements.incomeMax,
    elements.taxMax,
    elements.citizenshipMax
  ];

  resettableFilters.forEach((input) => {
    input.addEventListener(filterEventName(input), () => {
      elements.fullyMatched.checked = false;
      state.selectedCountry = null;
      render();
    });
  });

  elements.fullyMatched.addEventListener("change", () => {
    if (elements.fullyMatched.checked) {
      resetStandardFilters();
    }
    state.selectedCountry = null;
    render();
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
  elements.fileStatus.textContent = statusText;
  syncLanguageFilterOptions();
  applyUrlStateAfterData();
  render();
}

function normalizeResults(json) {
  const results = Array.isArray(json) ? json : json.results ?? [];

  return results.map((item) => {
    const data = item.data ?? item;
    const bestRoute = data.best_routes?.[0] ?? null;
    return {
      country: item.country ?? data.country ?? "UNKNOWN",
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
      tax: firstNumberValue(
        data.taxes?.taxation_system?.top_personal_income_tax_rate_percent,
        data.taxes?.digital_nomad_taxation?.top_or_screening_pit_rate_percent,
        data.taxes?.income_tax_rate_percent
      ),
      citizenshipYears: firstNumberValue(
        data.timeline?.total_years_to_citizenship,
        data.timeline?.years_to_citizenship,
        data.citizenship?.years_to_citizenship,
        data.citizenship?.ordinary_naturalization_years,
        data.settlement_track?.years_to_citizenship
      ),
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
  updateUrlState();
}

function readUrlState() {
  const params = new URLSearchParams(window.location.search);
  return {
    search: params.get("q"),
    status: params.get("status"),
    language: params.get("language"),
    citizenshipTrack: params.get("track"),
    jusSoli: params.get("jusSoli"),
    interesting: params.get("interesting") ?? params.get("fullyMatched"),
    incomeMax: params.get("incomeMax"),
    taxMax: params.get("taxMax"),
    citizenshipMax: params.get("citizenshipMax"),
    sort: params.get("sort"),
    direction: params.get("direction"),
    selected: params.get("selected")
  };
}

function applyUrlStateBeforeData() {
  const urlState = state.pendingUrlState;
  if (!urlState) return;

  state.isRestoringUrlState = true;
  const hasStandardFilters = hasStandardUrlFilters(urlState);
  const interestingFromUrl = urlState.interesting === "true";
  elements.fullyMatched.checked = interestingFromUrl || (!hasStandardFilters && urlState.interesting === null);
  setInputValue(elements.search, urlState.search);
  setSelectValue(elements.valid, urlState.status);
  setSelectValue(elements.citizenshipTrack, urlState.citizenshipTrack);
  setSelectValue(elements.jusSoli, urlState.jusSoli);
  setInputValue(elements.incomeMax, urlState.incomeMax);
  setInputValue(elements.taxMax, urlState.taxMax);
  setInputValue(elements.citizenshipMax, urlState.citizenshipMax);
  if (elements.fullyMatched.checked) {
    resetStandardFilters();
  }
  if (isValidSortKey(urlState.sort)) {
    state.sort.key = urlState.sort;
  }
  if (urlState.direction === "asc" || urlState.direction === "desc") {
    state.sort.direction = urlState.direction;
  }
  state.isRestoringUrlState = false;
}

function applyUrlStateAfterData() {
  const urlState = state.pendingUrlState;
  if (!urlState) {
    state.selectedCountry = null;
    return;
  }

  state.isRestoringUrlState = true;
  if (!elements.fullyMatched.checked) {
    setSelectValue(elements.language, urlState.language);
  }
  state.selectedCountry = state.rows.some((row) => row.country === urlState.selected)
    ? urlState.selected
    : null;
  state.isRestoringUrlState = false;
  state.pendingUrlState = null;
}

function resetStandardFilters() {
  elements.search.value = "";
  elements.valid.value = "all";
  elements.language.value = "all";
  elements.citizenshipTrack.value = "all";
  elements.jusSoli.value = "all";
  elements.incomeMax.value = "";
  elements.taxMax.value = "";
  elements.citizenshipMax.value = "";
}

function updateUrlState() {
  if (state.isRestoringUrlState) return;

  const params = new URLSearchParams();
  if (elements.fullyMatched.checked) {
    params.set("interesting", "true");
  } else {
    setUrlParam(params, "q", elements.search.value.trim());
    setUrlParam(params, "status", elements.valid.value, "all");
    setUrlParam(params, "language", elements.language.value, "all");
    setUrlParam(params, "track", elements.citizenshipTrack.value, "all");
    setUrlParam(params, "jusSoli", elements.jusSoli.value, "all");
    setUrlParam(params, "incomeMax", elements.incomeMax.value);
    setUrlParam(params, "taxMax", elements.taxMax.value);
    setUrlParam(params, "citizenshipMax", elements.citizenshipMax.value);
  }
  setUrlParam(params, "sort", state.sort.key, "citizenship");
  setUrlParam(params, "direction", state.sort.direction, "asc");
  setUrlParam(params, "selected", state.selectedCountry);

  const query = params.toString();
  const nextUrl = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
  window.history.replaceState(null, "", nextUrl);
}

function setInputValue(input, value) {
  if (value !== null) input.value = value;
}

function setSelectValue(select, value) {
  const normalizedValue = select === elements.valid ? normalizeStatusFilterValue(value) : value;
  if (normalizedValue !== null && Array.from(select.options).some((option) => option.value === normalizedValue)) {
    select.value = normalizedValue;
  }
}

function normalizeStatusFilterValue(value) {
  if (value === "partial" || value === "uncertain") return "review";
  return value;
}

function hasStandardUrlFilters(urlState) {
  return Boolean(
    urlState.search ||
    (urlState.status && normalizeStatusFilterValue(urlState.status) !== "all") ||
    (urlState.language && urlState.language !== "all") ||
    (urlState.citizenshipTrack && urlState.citizenshipTrack !== "all") ||
    (urlState.jusSoli && urlState.jusSoli !== "all") ||
    urlState.incomeMax ||
    urlState.taxMax ||
    urlState.citizenshipMax
  );
}

function setUrlParam(params, key, value, defaultValue = "") {
  if (value !== null && value !== undefined && value !== "" && value !== defaultValue) {
    params.set(key, value);
  }
}

function isValidSortKey(key) {
  return ["country", "valid", "income", "tax", "citizenship", "jusSoli", "citizenshipTrack"].includes(key);
}

function filteredRows() {
  const query = elements.search.value.trim().toLowerCase();
  const valid = elements.valid.value;
  const language = elements.language.value;
  const citizenshipTrack = elements.citizenshipTrack.value;
  const jusSoli = elements.jusSoli.value;
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
    if (valid !== "all" && !matchesStatus(row, valid)) return false;
    if (language !== "all" && !matchesLanguage(row, language)) return false;
    if (citizenshipTrack !== "all" && !matchesCitizenshipTrack(row.citizenshipTrack, citizenshipTrack)) return false;
    if (jusSoli !== "all" && jusSoliFilterValue(row.jusSoli) !== jusSoli) return false;
    if (fullyMatched && !isInterestingRow(row)) return false;
    if (incomeMax !== null && row.income !== null && row.income > incomeMax) return false;
    if (taxMax !== null && row.tax !== null && row.tax > taxMax) return false;
    if (citizenshipMax !== null && row.citizenshipYears !== null && row.citizenshipYears > citizenshipMax) return false;
    return true;
  });
}

function compareRows(a, b) {
  const direction = state.sort.direction === "asc" ? 1 : -1;
  const key = state.sort.key;
  const primaryResult = compareBySortKey(a, b, key) * direction;
  return primaryResult || compareDefaultOrder(a, b, key);
}

function compareBySortKey(a, b, key) {
  if (key === "country") return compareCountries(a, b);
  if (key === "valid") return compareStatuses(a, b);
  if (key === "citizenshipTrack") return compareCitizenshipTracks(a, b);
  const valueA = sortValue(a, key);
  const valueB = sortValue(b, key);

  if (typeof valueA === "number" || typeof valueB === "number") {
    return compareNullableNumbers(valueA, valueB);
  }

  return String(valueA ?? "").localeCompare(String(valueB ?? ""), "en");
}

function compareDefaultOrder(a, b, primaryKey) {
  const comparisons = [
    ["citizenship", compareCitizenshipYears],
    ["citizenshipTrack", compareCitizenshipTracks],
    ["country", compareCountries],
    ["tax", compareTaxRates],
    ["valid", compareStatuses]
  ];

  for (const [key, compare] of comparisons) {
    if (key === primaryKey) continue;
    const result = compare(a, b);
    if (result !== 0) return result;
  }

  return 0;
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

function compareStatuses(a, b) {
  return statusRank(a) - statusRank(b);
}

function compareCitizenshipTracks(a, b) {
  return citizenshipTrackRank(a.citizenshipTrack) - citizenshipTrackRank(b.citizenshipTrack);
}

function compareNullableNumbers(a, b) {
  return (a ?? Number.POSITIVE_INFINITY) - (b ?? Number.POSITIVE_INFINITY);
}

function sortValue(row, key) {
  if (key === "income") return row.income;
  if (key === "tax") return row.tax;
  if (key === "citizenship") return row.citizenshipYears;
  if (key === "jusSoli") return jusSoliRank(row.jusSoli);
  return row.country;
}

function renderMetrics() {
  const okRows = state.rows.filter((row) => row.status === "ok");
  const validRows = okRows.filter((row) => row.valid === true);
  const totalMinusNotEligibleRows = state.rows.filter((row) => row.valid !== false);
  const fullyMatchedOrReviewRows = okRows.filter(isInterestingRow);
  const incomes = validRows.map((row) => row.income).filter((value) => value !== null);
  const avgIncome = incomes.length
    ? Math.round(incomes.reduce((sum, value) => sum + value, 0) / incomes.length)
    : null;

  elements.metricTotal.textContent = state.rows.length;
  elements.metricValid.textContent = totalMinusNotEligibleRows.length;
  elements.metricEligiblePath.textContent = fullyMatchedOrReviewRows.length;
  elements.metricAvgIncome.textContent = avgIncome === null ? "NOT FOUND" : money(avgIncome);
}

function renderTable(rows) {
  if (!rows.length) {
    elements.rows.innerHTML = '<tr><td colspan="9">NO COUNTRIES MATCH THE SELECTED FILTERS.</td></tr>';
    return;
  }

  elements.rows.innerHTML = rows.map((row, index) => `
    <tr class="${row.country === state.selectedCountry ? "active" : ""}" data-country="${escapeAttr(row.country)}">
      <td class="number-col">${index + 1}</td>
      <td>
        <span class="country-name">${escapeHtml(row.country)}</span>
        <span class="language-chip-row">${formatLanguageChips(row.languages)}</span>
      </td>
      <td class="status-col">${statusPill(row)}</td>
      <td>${escapeHtml(formatIncome(row))}</td>
      <td>${formatNullable(row.tax, (value) => `${value}%`)}</td>
      <td>${formatNullable(row.citizenshipYears, (value) => `${value} YRS`)}</td>
      <td>${jusSoliPill(row.jusSoli)}</td>
      <td>${citizenshipTrackPill(row.citizenshipTrack)}</td>
      <td class="route-col">
        ${escapeHtml(row.bestRouteName ?? "NOT FOUND")}
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
    elements.details.innerHTML = '<p class="empty">SELECT A COUNTRY IN THE TABLE TO SEE DETAILS.</p>';
    return;
  }

  if (!visibleRows.some((item) => item.country === state.selectedCountry)) {
    state.selectedCountry = null;
    elements.details.innerHTML = '<p class="empty">SELECT A COUNTRY IN THE TABLE TO SEE DETAILS.</p>';
    return;
  }

  const row = state.rows.find((item) => item.country === state.selectedCountry);
  if (!row) {
    state.selectedCountry = null;
    elements.details.innerHTML = '<p class="empty">SELECT A COUNTRY IN THE TABLE TO SEE DETAILS.</p>';
    return;
  }

  if (row.status === "error") {
    elements.details.innerHTML = `
      <h2>${escapeHtml(row.country)}</h2>
      <p class="summary">THE COUNTRY REQUEST ENDED WITH AN ERROR.</p>
      <div class="detail-block">
        <h3>ERROR</h3>
        <p>${escapeHtml(row.error?.message ?? "UNKNOWN ERROR")}</p>
      </div>
    `;
    return;
  }

  const data = row.data;
  const route = data.best_routes?.[0];
  const sources = (data.sources ?? []).slice(0, 6);

  elements.details.innerHTML = `
    <h2>${escapeHtml(row.country)}</h2>
    <p class="summary">${escapeHtml(row.summary || "SUMMARY IS NOT FILLED IN.")}</p>
    ${statusPill(row)}
    <p class="subtext">${escapeHtml(formatResearchQuality(row))}</p>
    <p class="explain">${escapeHtml(formatStatusMeaning(row))}</p>

    <div class="detail-block">
      <h3>BEST ROUTE</h3>
      <p>${escapeHtml(route?.route_name ?? "NOT FOUND")}</p>
      ${formatRouteFacts(route)}
      <p class="summary">${escapeHtml(route?.notes ?? route?.initial_validity?.value ?? "")}</p>
    </div>

    <div class="detail-block">
      <h3>VISA APPLICATION</h3>
      <p class="explain">Official application link when confirmed; otherwise the safest official route or immigration page found in the dataset.</p>
      ${formatVisaApplication(data.visa_application)}
    </div>

    <div class="detail-block">
      <h3>KEY NUMBERS</h3>
      <p class="explain">Income is the route threshold, tax is the top or screening personal rate, and citizenship is the estimated minimum timeline where captured.</p>
      <ul class="detail-list">
        <li>INCOME: ${escapeHtml(formatIncome(row))}</li>
        <li>INCOME PROOF: ${escapeHtml(formatIncomeProof(route))}</li>
        <li>TAX: ${formatNullable(row.tax, (value) => `${value}%`)}</li>
        <li>CITIZENSHIP TIMELINE: ${formatNullable(row.citizenshipYears, (value) => `${value} YRS`)}</li>
      </ul>
    </div>

    <div class="detail-block">
      <h3>TAXATION SYSTEM</h3>
      <p class="explain">Tax values are screening data. Progressive systems show the top marginal rate, not the expected effective rate.</p>
      <ul class="detail-list">
        <li>RATE TYPE: ${escapeHtml(data.taxes?.taxation_system?.rate_type ?? "NOT FOUND")}</li>
        <li>TOP/SCREENING RATE: ${formatNullable(data.taxes?.taxation_system?.top_personal_income_tax_rate_percent, (value) => `${value}%`)}</li>
        <li>RESIDENCE: ${escapeHtml(data.taxes?.taxation_system?.tax_residency_rule ?? "NOT FOUND")}</li>
        <li>INCOME SCOPE: ${escapeHtml(data.taxes?.taxation_system?.income_scope ?? "NOT FOUND")}</li>
        <li>SPECIAL REGIMES: ${escapeHtml(data.taxes?.taxation_system?.special_regimes ?? "NOT FOUND")}</li>
        <li>SOCIAL/PAYROLL: ${escapeHtml(data.taxes?.taxation_system?.social_security ?? "NOT FOUND")}</li>
        <li>PROGRESSIVE NOTES: ${escapeHtml(data.taxes?.taxation_system?.progressive_tax_notes ?? "NOT FOUND")}</li>
      </ul>
      ${formatTaxBrackets(data.taxes?.taxation_system?.tax_brackets)}
      <p class="summary">${escapeHtml(data.taxes?.taxation_system?.notes ?? "")}</p>
    </div>

    <div class="detail-block">
      <h3>DIGITAL NOMAD TAX DETAIL</h3>
      <p class="explain">Route-specific tax notes for remote workers, freelancers, and nomad-style statuses. These can differ from ordinary employee tax.</p>
      <ul class="detail-list">
        <li>ROUTE CATEGORY: ${escapeHtml(data.taxes?.digital_nomad_taxation?.route_tax_category ?? "NOT FOUND")}</li>
        <li>FOREIGN INCOME: ${escapeHtml(data.taxes?.digital_nomad_taxation?.foreign_income_treatment ?? "NOT FOUND")}</li>
        <li>NOMAD/INBOUND REGIME: ${escapeHtml(data.taxes?.digital_nomad_taxation?.special_digital_nomad_or_inbound_regime ?? "NOT FOUND")}</li>
        <li>SOCIAL/PAYROLL: ${escapeHtml(data.taxes?.digital_nomad_taxation?.social_security_and_payroll ?? "NOT FOUND")}</li>
        <li>FIXED PAYMENTS: ${escapeHtml(data.taxes?.digital_nomad_taxation?.fixed_payments?.status ?? "NOT FOUND")}</li>
        <li>FIXED PAYMENT NOTES: ${escapeHtml(data.taxes?.digital_nomad_taxation?.fixed_payments?.notes ?? "NOT FOUND")}</li>
      </ul>
      <p class="summary">${escapeHtml(data.taxes?.digital_nomad_taxation?.notes ?? "")}</p>
    </div>

    <div class="detail-block">
      <h3>TRANSITIONS</h3>
      <p class="explain">${escapeHtml(citizenshipTrackDescription(row.citizenshipTrack))}</p>
      <ul class="detail-list">
        <li>TRACK: ${citizenshipTrackPill(row.citizenshipTrack)}</li>
        <li>RAW TRACK: ${escapeHtml(data.settlement_track?.classification ?? "NOT FOUND")}</li>
        <li>CITIZENSHIP FROM THIS ROUTE: ${escapeHtml(formatCitizenshipTrack(data.settlement_track?.can_lead_to_citizenship_from_this_route))}</li>
        <li>STATUS SWITCH NEEDED: ${escapeHtml(formatBooleanish(data.settlement_track?.requires_switch_to_another_status))}</li>
      </ul>
      <p>${escapeHtml(data.timeline?.key_conditions?.value ?? "NOT FOUND.")}</p>
      <p class="summary">${escapeHtml(data.settlement_track?.summary ?? "")}</p>
    </div>

    <div class="detail-block">
      <h3>MARRIAGE AND CHILD</h3>
      <p class="explain">Family data separates child citizenship, parent residence benefit, and marriage shortcuts. A citizen child or spouse usually does not mean automatic citizenship for the applicant.</p>
      <p>${escapeHtml(data.marriage?.requirements_and_risks?.value ?? "NOT FOUND.")}</p>
      <p class="summary">${escapeHtml(data.child_citizenship?.benefit_to_migrant_father?.value ?? "")}</p>
    </div>

    <div class="detail-block">
      <h3>PASSPORT AND LANGUAGES</h3>
      <p class="explain">Passport values come from the captured passport index source; language values are official languages, not a guarantee of practical English support.</p>
      <ul class="detail-list">
        <li>RANK: ${formatNullable(numberValue(data.passport?.rank), (value) => `#${value}`)}</li>
        <li>VISA-FREE: ${formatNullable(numberValue(data.passport?.visa_free_destinations), (value) => `${value} DESTINATIONS`)}</li>
        <li>LANGUAGES: ${escapeHtml((data.languages?.official_languages ?? []).join(", ") || "NOT FOUND")}</li>
      </ul>
    </div>

    <div class="detail-block">
      <h3>AVERAGE CITIZEN SALARY</h3>
      <p class="explain">Salary is for an average citizen or resident worker, not the immigration income threshold. Missing min/max means no reliable wage range has been captured yet.</p>
      ${formatAverageCitizenSalary(data.labor_market?.average_citizen_salary)}
    </div>

    <div class="detail-block">
      <h3>SOURCES</h3>
      <p class="explain">First captured sources for this country. Prefer official immigration, tax, statistics, and law pages before acting.</p>
      <div class="sources">
        ${sources.length ? sources.map((source) => `
          <a href="${escapeAttr(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.title || source.url)}</a>
        `).join("") : '<p class="empty">NO SOURCES LISTED.</p>'}
      </div>
    </div>
  `;
}

function statusPill(row) {
  if (row.status === "error") return '<span class="pill bad">ERROR</span>';
  if (row.valid === true) return '<span class="pill good">ELIGIBLE</span>';
  if (row.valid === "partial" || row.valid === "uncertain") return '<span class="pill warn">REVIEW / PARTIAL</span>';
  return '<span class="pill bad">NOT ELIGIBLE</span>';
}

function matchesStatus(row, selected) {
  if (selected === "review") return row.valid === "partial" || row.valid === "uncertain";
  return String(row.valid) === selected || row.status === selected;
}

function statusRank(row) {
  if (row.valid === true) return 1;
  if (row.valid === "partial" || row.valid === "uncertain") return 2;
  if (row.valid === false) return 4;
  if (row.status === "error") return 5;
  return 6;
}

function syncLanguageFilterOptions() {
  const current = elements.language.value;
  const languages = Array.from(new Set(
    state.rows.flatMap((row) => row.languages).filter(Boolean)
  )).sort((a, b) => a.localeCompare(b, "en"));
  const hasMissing = state.rows.some((row) => row.languages.length === 0);

  elements.language.innerHTML = [
    '<option value="all">ALL</option>',
    ...languages.map((language) => `<option value="${escapeAttr(language)}">${escapeHtml(language.toUpperCase())}</option>`),
    hasMissing ? '<option value="missing">NOT FOUND</option>' : ""
  ].join("");

  if (current === "missing" && hasMissing) {
    elements.language.value = current;
    return;
  }

  elements.language.value = languages.includes(current) ? current : "all";
}

function filterEventName(input) {
  return input.tagName === "SELECT" ? "change" : "input";
}

function matchesCitizenshipTrack(actual, selected) {
  if (selected === "not_valid") return String(actual).startsWith("not_valid");
  return actual === selected;
}

function matchesLanguage(row, selected) {
  if (selected === "missing") return row.languages.length === 0;
  return row.languages.some((language) => language.toLowerCase() === selected.toLowerCase());
}

function hasEligibleCitizenshipPath(row) {
  return row.valid === true &&
    row.data?.fully_matched === true &&
    row.data?.regular_foreign_contract_remote_work_fit?.value === true &&
    (
      row.citizenshipTrack === "strong_citizenship_track" ||
      row.citizenshipTrack === "possible_with_conversion"
    );
}

function isInterestingRow(row) {
  if (row.citizenshipTrack === "weak_or_uncertain_citizenship_track") return false;
  return hasEligibleCitizenshipPath(row) ||
    row.valid === "partial" ||
    row.valid === "uncertain";
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
  if (value === "strong_citizenship_track") return "STRONG";
  if (value === "possible_with_conversion") return "CONVERSION NEEDED";
  if (value === "weak_or_uncertain_citizenship_track") return "WEAK / UNCERTAIN";
  if (value === "temporary_nomad_only") return "NOMAD ONLY";
  if (String(value).startsWith("not_valid")) return "NOT VALID";
  return "NOT FOUND";
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
  if (normalized.includes("unconditional")) return "YES";
  if (normalized.includes("birthright")) return "YES / EXCEPTIONS";
  if (normalized.includes("conditional")) return "CONDITIONAL";
  if (normalized.includes("restricted") || normalized.includes("limited")) return "LIMITED";
  if (normalized.includes("sanguinis")) return "NO";
  return "NOT FOUND";
}

function jusSoliFilterValue(value) {
  const label = jusSoliLabel(value);
  if (label === "YES") return "yes";
  if (label === "YES / EXCEPTIONS") return "yes_exceptions";
  if (label === "CONDITIONAL") return "conditional";
  if (label === "LIMITED") return "limited";
  if (label === "NO") return "no";
  return "missing";
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

function firstNumberValue(...values) {
  for (const value of values) {
    const number = numberValue(value);
    if (number !== null) return number;
  }
  return null;
}

function parseOptionalNumber(value) {
  if (value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatNullable(value, formatter) {
  return value === null || value === undefined ? "NOT FOUND" : formatter(value);
}

function formatIncome(row) {
  if (row.income !== null && row.income !== undefined) return `${money(row.income)} / MO`;
  return row.incomeText || "NOT FOUND";
}

function formatIncomeProof(route) {
  const months = numberValue(route?.income_proof_months);
  if (months !== null) return `${months} MO`;
  return route?.income_proof_months?.display_value || route?.income_proof_months?.value || "NOT FOUND";
}

function formatLanguages(languages) {
  return languages.length ? languages.join(", ") : "NOT FOUND";
}

function formatLanguageChips(languages) {
  const values = languages.length ? languages : ["NOT FOUND"];
  return values.map((language) => `<span class="language-chip">${escapeHtml(language)}</span>`).join("");
}

function formatResearchQuality(row) {
  const confidence = row.confidence ? row.confidence.toUpperCase() : "NOT FOUND";
  return `RESEARCH QUALITY: ${confidence} · ${row.sourceCount} SOURCES`;
}

function formatStatusMeaning(row) {
  if (row.valid === true) {
    return row.data?.fully_matched
      ? "Eligible means the selected route fits the foreign-contract remote-worker profile and has a credible residence-to-citizenship path in the captured sources."
      : "Eligible but not fully matched means the route can work, but one or more filing, tax, or settlement details still need review.";
  }
  if (row.valid === "partial") {
    return "Partial means the country has an interesting independent skilled or residence route, but it is not a clean ordinary remote-work match.";
  }
  if (row.valid === "uncertain") {
    return "Review means the route may fit, but official filing or settlement evidence is incomplete, contradictory, or still needs manual verification.";
  }
  return "Not eligible means the captured routes are visitor-only, employer-sponsored, investment/startup/elite based, pending, temporary-only, or otherwise not a fit for this profile.";
}

function formatRouteFacts(route) {
  if (!route) return '<p class="empty compact">ROUTE DETAILS NOT FOUND.</p>';

  return `
    <ul class="detail-list compact">
      <li>TYPE: ${escapeHtml(route.route_type ?? "NOT FOUND")}</li>
      <li>INDEPENDENT APPLICATION: ${escapeHtml(formatBooleanish(route.independent_application_possible))}</li>
      <li>LOCAL EMPLOYER REQUIRED: ${escapeHtml(formatBooleanish(route.local_employer_required))}</li>
      <li>FOREIGN CONTRACT / INCOME: ${escapeHtml(formatBooleanish(route.foreign_contract_or_income_required))}</li>
      <li>TEMPORARY RESIDENCE: ${escapeHtml(formatBooleanish(route.direct_temporary_residence_possible))}</li>
      <li>PERMANENT RESIDENCE: ${escapeHtml(formatBooleanish(route.direct_permanent_residence_possible))}</li>
    </ul>
  `;
}

function citizenshipTrackDescription(value) {
  if (value === "strong_citizenship_track") {
    return "Strong means the selected independent route is itself residence-oriented and can realistically support PR or citizenship if requirements are met.";
  }
  if (value === "possible_with_conversion") {
    return "Conversion needed means the route can be useful, but long-term settlement depends on renewal, ordinary residence rules, or switching/maintaining a qualifying status.";
  }
  if (value === "weak_or_uncertain_citizenship_track") {
    return "Weak or uncertain means the route exists, but the link to PR or citizenship is unclear, discretionary, or not confirmed enough for ranking.";
  }
  if (value === "temporary_nomad_only") {
    return "Nomad only means the status may allow temporary remote work or stay, but should not be treated as a citizenship path.";
  }
  if (String(value ?? "").startsWith("not_valid")) {
    return "Not valid means no current route matching the ordinary foreign-contract remote-worker profile was confirmed.";
  }
  return "Track meaning was not captured in the normalized dataset.";
}

function formatBooleanish(value) {
  if (value === true) return "YES";
  if (value === false) return "NO";
  if (value === null || value === undefined) return "NOT FOUND";
  if (value === "uncertain") return "UNCERTAIN";
  if (value === "partial") return "PARTIAL";
  return String(value).replaceAll("_", " ").toUpperCase();
}

function formatVisaApplication(application) {
  if (!application?.application_url) {
    return `
      <p class="empty compact">OFFICIAL APPLICATION LINK NOT FOUND.</p>
      <p class="summary">${escapeHtml(application?.notes ?? "")}</p>
    `;
  }

  return `
    <div class="sources">
      <a href="${escapeAttr(application.application_url)}" target="_blank" rel="noreferrer">
        ${escapeHtml(application.title || application.application_url)}
      </a>
    </div>
    <ul class="detail-list compact">
      <li>TYPE: ${escapeHtml(formatApplicationUrlType(application.application_url_type))}</li>
      <li>CHECKED: ${escapeHtml(application.last_checked ?? "NOT FOUND")}</li>
    </ul>
    <p class="summary">${escapeHtml(application.notes ?? "")}</p>
  `;
}

function formatApplicationUrlType(value) {
  if (value === "direct_application") return "DIRECT APPLICATION";
  if (value === "official_route_info") return "OFFICIAL ROUTE INFO";
  if (value === "official_general_visa_portal") return "OFFICIAL VISA PORTAL";
  if (value === "official_immigration_home") return "OFFICIAL IMMIGRATION HOME";
  return "NOT FOUND";
}

function formatAverageCitizenSalary(salary) {
  if (!salary) return '<p class="empty compact">SALARY DATA NOT FOUND.</p>';

  return `
    <ul class="detail-list compact">
      <li>MIN: ${formatSourcedMoney(salary.min_salary_usd_monthly)} · ${escapeHtml(salary.min_salary_local_currency?.value ?? "LOCAL NOT FOUND")}</li>
      <li>AVERAGE: ${formatSourcedMoney(salary.average_salary_usd_monthly)} · ${escapeHtml(salary.average_salary_local_currency?.value ?? "LOCAL NOT FOUND")}</li>
      <li>MEDIAN: ${formatSourcedMoney(salary.median_salary_usd_monthly)} · ${escapeHtml(salary.median_salary_local_currency?.value ?? "LOCAL NOT FOUND")}</li>
      <li>MAX: ${formatSourcedMoney(salary.max_salary_usd_monthly)} · ${escapeHtml(salary.max_salary_local_currency?.value ?? "LOCAL NOT FOUND")}</li>
      <li>BASIS: ${escapeHtml(salary.salary_basis ?? "NOT FOUND")}</li>
      <li>PERIOD: ${escapeHtml((salary.period ?? "NOT FOUND").toUpperCase())}</li>
      <li>CONFIDENCE: ${escapeHtml((salary.confidence ?? "NOT FOUND").toUpperCase())}</li>
    </ul>
    <p class="summary">${escapeHtml(salary.notes ?? "")}</p>
  `;
}

function formatSourcedMoney(value) {
  const number = numberValue(value);
  return number === null ? "USD NOT FOUND" : `${money(number)} / MO`;
}

function formatTaxBrackets(brackets) {
  if (!Array.isArray(brackets) || brackets.length === 0) {
    return '<p class="empty compact">NO TAX BRACKETS CAPTURED.</p>';
  }

  return `
    <div class="tax-brackets">
      ${brackets.map((bracket) => `
        <div class="tax-bracket">
          <strong>${formatNullable(bracket.rate_percent, (value) => `${value}%`)}</strong>
          <span>${escapeHtml(bracket.threshold_local ?? "THRESHOLD NOT FOUND")}</span>
          <small>${escapeHtml(formatBracketUsd(bracket.threshold_usd_approx))}</small>
          <p>${escapeHtml(bracket.applies_to ?? bracket.notes ?? "")}</p>
        </div>
      `).join("")}
    </div>
  `;
}

function formatBracketUsd(value) {
  if (value === null || value === undefined) return "USD NOT FOUND";
  return `~${money(value)} USD`;
}

function formatCitizenshipTrack(value) {
  if (value === true) return "YES, IF CONDITIONS ARE MET";
  if (value === false) return "NO, ANOTHER STATUS IS REQUIRED";
  if (value === "uncertain") return "UNCLEAR / CONVERSION NEEDED";
  return "NOT FOUND";
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
