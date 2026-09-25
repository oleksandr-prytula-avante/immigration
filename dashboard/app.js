import { normalizeResults, numberValue, compareNullableNumbers, matchesMaximum, safeHttpUrl, languageKey } from "./dataset-model.js";

const state = {
  raw: null,
  rows: [],
  selectedCountry: null,
  sort: { key: "citizenship", direction: "asc" },
  pendingUrlState: null,
  isRestoringUrlState: false,
  loadVersion: 0,
  hasUploadedDataset: false
};

const elements = {
  file: document.querySelector("#jsonFile"),
  search: document.querySelector("#searchInput"),
  valid: document.querySelector("#validFilter"),
  language: document.querySelector("#languageFilter"),
  prCit: document.querySelector("#prCitFilter"),
  jusSoli: document.querySelector("#jusSoliFilter"),
  incomeMax: document.querySelector("#incomeMax"),
  taxMax: document.querySelector("#taxMax"),
  citizenshipMax: document.querySelector("#citizenshipMax"),
  rows: document.querySelector("#countryRows"),
  details: document.querySelector("#detailsPanel"),
  fileStatus: document.querySelector("#fileStatus"),
  visibleCount: document.querySelector("#visibleCount"),
  metricTotal: document.querySelector("#metricTotal"),
  metricValid: document.querySelector("#metricValid"),
  metricAvgIncome: document.querySelector("#metricAvgIncome")
};

document.addEventListener("DOMContentLoaded", async () => {
  state.pendingUrlState = readUrlState();
  applyUrlStateBeforeData();
  bindEvents();
  try {
    const response = await fetch("./data/all-countries.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (state.hasUploadedDataset) return;
    loadDataset(data, `RESEARCH DATA LOADED · UPDATED ${data.meta?.last_full_research_date ?? data.meta?.updated_at ?? "DATE NOT RECORDED"}`);
  } catch (error) {
    if (state.hasUploadedDataset) return;
    elements.fileStatus.textContent = `COULD NOT LOAD DEFAULT DATA: ${error.message}. UPLOAD A RESULT JSON FILE.`;
    render();
  }
});

function bindEvents() {
  elements.file.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const version = ++state.loadVersion;
    try {
      const json = JSON.parse(await file.text());
      if (version !== state.loadVersion) return;
      loadDataset(json, `LOADED FILE: ${file.name}`);
      state.hasUploadedDataset = true;
    } catch (error) {
      if (version === state.loadVersion) elements.fileStatus.textContent = `COULD NOT READ JSON: ${error.message}`;
    } finally {
      elements.file.value = "";
    }
  });

  const resettableFilters = [
    elements.search,
    elements.valid,
    elements.language,
    elements.prCit,
    elements.jusSoli,
    elements.incomeMax,
    elements.taxMax,
    elements.citizenshipMax
  ];

  resettableFilters.forEach((input) => {
    input.addEventListener(filterEventName(input), () => {
      if (input === elements.prCit && input.value === "category:no_visa") elements.valid.value = "all";
      if (input === elements.valid && input.value === "true" && elements.prCit.value === "category:no_visa") elements.prCit.value = "all";
      state.selectedCountry = null;
      render();
    });
  });

  document.querySelectorAll("th[data-sort]").forEach((header) => {
    header.querySelector("button").addEventListener("click", () => {
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
  const rows = normalizeResults(json);
  state.raw = json;
  state.rows = rows;
  elements.fileStatus.textContent = statusText;
  syncLanguageFilterOptions();
  applyUrlStateAfterData();
  render();
}

function render() {
  const rows = filteredRows().sort(compareRows);
  renderMetrics();
  document.querySelectorAll("th[data-sort]").forEach((header) => {
    header.setAttribute("aria-sort", header.dataset.sort === state.sort.key ? (state.sort.direction === "asc" ? "ascending" : "descending") : "none");
  });
  renderTable(rows);
  renderDetails(rows);
  elements.visibleCount.textContent = rows.length;
  updateUrlState();
}

function readUrlState() {
  const params = new URLSearchParams(window.location.search);
  return {
    search: params.get("q"),
    status: params.get("dnv") ?? params.get("status"),
    language: params.get("language"),
    prCit: params.get("prCit") ?? params.get("nomadTransition"),
    citCategory: params.get("citCategory"),
    jusSoli: params.get("jusSoli"),
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
  setInputValue(elements.search, urlState.search);
  setSelectValue(elements.valid, urlState.status);
  const citizenshipFilter = urlState.citCategory && urlState.citCategory !== "all"
    ? `category:${urlState.citCategory}`
    : urlState.prCit;
  setSelectValue(elements.prCit, citizenshipFilter);
  if (elements.prCit.value === "category:no_visa" && urlState.status === null) elements.valid.value = "all";
  setSelectValue(elements.jusSoli, urlState.jusSoli);
  setInputValue(elements.incomeMax, urlState.incomeMax);
  setInputValue(elements.taxMax, urlState.taxMax);
  setInputValue(elements.citizenshipMax, urlState.citizenshipMax);
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
  setSelectValue(elements.language, urlState.language === null ? null : languageKey(urlState.language));
  state.selectedCountry = state.rows.some((row) => row.country === urlState.selected)
    ? urlState.selected
    : null;
  state.isRestoringUrlState = false;
  state.pendingUrlState = null;
}

function updateUrlState() {
  if (state.isRestoringUrlState) return;

  const params = new URLSearchParams();
  setUrlParam(params, "q", elements.search.value.trim());
  setUrlParam(params, "dnv", elements.valid.value, "true");
  setUrlParam(params, "language", elements.language.value, "all");
  setUrlParam(params, "prCit", elements.prCit.value, "all");
  setUrlParam(params, "jusSoli", elements.jusSoli.value, "all");
  setUrlParam(params, "incomeMax", elements.incomeMax.value);
  setUrlParam(params, "taxMax", elements.taxMax.value);
  setUrlParam(params, "citizenshipMax", elements.citizenshipMax.value);
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
  const normalizedValue = select === elements.valid
    ? normalizeStatusFilterValue(value)
    : select === elements.prCit && (value === "no_nomad_route" || value === "uncertain")
      ? (value === "no_nomad_route" ? "category:no_visa" : "category:unconfirmed")
      : select === elements.prCit && value === "category:confirmed" ? "direct"
    : value;
  if (normalizedValue !== null && Array.from(select.options).some((option) => option.value === normalizedValue)) {
    select.value = normalizedValue;
  }
}

function normalizeStatusFilterValue(value) {
  if (value === "partial" || value === "uncertain") return "review";
  return value;
}

function setUrlParam(params, key, value, defaultValue = "") {
  if (value !== null && value !== undefined && value !== "" && value !== defaultValue) {
    params.set(key, value);
  }
}

function isValidSortKey(key) {
  return ["country", "valid", "income", "tax", "citizenship", "jusSoli", "citizenshipTrack", "nomadTransition"].includes(key);
}

function filteredRows() {
  const query = elements.search.value.trim().toLowerCase();
  const valid = elements.valid.value;
  const language = elements.language.value;
  const prCit = elements.prCit.value;
  const jusSoli = elements.jusSoli.value;
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
      row.nomadTransition.label,
      citizenshipCategoryLabel(row.citizenshipCategory),
      row.jusSoli,
      jusSoliLabel(row.jusSoli),
      row.languages.join(" "),
      row.data.notes
    ].join(" ").toLowerCase();

    if (query && !haystack.includes(query)) return false;
    if (valid !== "all" && !matchesStatus(row, valid)) return false;
    if (language !== "all" && !matchesLanguage(row, language)) return false;
    if (prCit !== "all" && !matchesCitizenshipFilter(row, prCit)) return false;
    if (jusSoli !== "all" && jusSoliFilterValue(row.jusSoli) !== jusSoli) return false;
    if (!matchesMaximum(row.income, incomeMax)) return false;
    if (!matchesMaximum(row.tax, taxMax)) return false;
    if (!matchesMaximum(row.citizenshipYears, citizenshipMax)) return false;
    return true;
  });
}

function compareRows(a, b) {
  const direction = state.sort.direction === "asc" ? 1 : -1;
  const key = state.sort.key;
  const primaryResult = ["income", "tax", "citizenship"].includes(key)
    ? compareNullableNumbers(sortValue(a, key), sortValue(b, key), direction)
    : compareBySortKey(a, b, key) * direction;
  return primaryResult || compareDefaultOrder(a, b, key);
}

function compareBySortKey(a, b, key) {
  if (key === "country") return compareCountries(a, b);
  if (key === "valid") return compareStatuses(a, b);
  if (key === "citizenshipTrack") return compareCitizenshipTracks(a, b);
  if (key === "nomadTransition") return compareNomadTransitions(a, b);
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
    ["nomadTransition", compareNomadTransitions],
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

function compareNomadTransitions(a, b) {
  return nomadTransitionRank(a.nomadTransition.status) - nomadTransitionRank(b.nomadTransition.status);
}

function sortValue(row, key) {
  if (key === "income") return row.income;
  if (key === "tax") return row.tax;
  if (key === "citizenship") return row.citizenshipYears;
  if (key === "jusSoli") return jusSoliRank(row.jusSoli);
  return row.country;
}

function renderMetrics() {
  const validRows = state.rows.filter((row) => row.valid === true);
  const incomes = validRows.map((row) => row.income).filter((value) => value !== null);
  const avgIncome = incomes.length
    ? Math.round(incomes.reduce((sum, value) => sum + value, 0) / incomes.length)
    : null;

  elements.metricTotal.textContent = state.rows.length;
  elements.metricValid.textContent = validRows.length;
  elements.metricAvgIncome.textContent = avgIncome === null ? "NOT FOUND" : money(avgIncome);
}

function renderTable(rows) {
  if (!rows.length) {
    elements.rows.innerHTML = '<tr><td colspan="7">NO COUNTRIES MATCH THE SELECTED FILTERS.</td></tr>';
    return;
  }

  elements.rows.innerHTML = rows.map((row, index) => `
    <tr class="${row.country === state.selectedCountry ? "active" : ""}" data-country="${escapeAttr(row.country)}">
      <td>
        <button type="button" class="country-name country-select" aria-controls="detailsPanel" aria-pressed="${row.country === state.selectedCountry}">${escapeHtml(row.country)}</button>
        <span class="language-chip-row">${formatLanguageChips(row.languages)}</span>
      </td>
      <td class="route-col">
        ${escapeHtml(row.bestRouteName ?? (row.status === "error" ? "RESEARCH ERROR" : "NO"))}
        <span class="subtext">${escapeHtml(row.bestRouteType ?? "")}</span>
      </td>
      <td class="income-col">${escapeHtml(formatIncome(row))}</td>
      <td>${escapeHtml(formatTax(row))}</td>
      <td class="nomad-col">${nomadTransitionPill(row.nomadTransition)}</td>
      <td>${formatNullable(row.citizenshipYears, (value) => `${value} YRS`)}</td>
      <td>${jusSoliPill(row.jusSoli)}</td>
    </tr>
  `).join("");

  elements.rows.querySelectorAll("tr[data-country]").forEach((rowElement) => {
    rowElement.addEventListener("click", () => {
      state.selectedCountry = rowElement.dataset.country;
      render();
      elements.rows.querySelector("tr.active button")?.focus({ preventScroll: true });
      elements.details.scrollTop = 0;
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
  const route = row.nomadRoute;
  const sources = data.sources ?? [];

  elements.details.innerHTML = `
    <h2>${escapeHtml(row.country)}</h2>
    <p class="summary">${escapeHtml(row.summary || "SUMMARY IS NOT FILLED IN.")}</p>
    ${statusPill(row)}
    <p class="subtext">${escapeHtml(formatResearchQuality(row))}</p>
    <p class="explain">${escapeHtml(formatStatusMeaning(row))}</p>

    <div class="detail-block">
      <h3>COUNTRY OVERVIEW</h3>
      <ul class="detail-list">
        <li>NOMAD / REMOTE-WORK ROUTE: ${escapeHtml(row.valid ? "YES" : "NO")}</li>
        <li>REMOTE WORK FIT: ${formatRemoteWorkFit(data.regular_foreign_contract_remote_work_fit)}</li>
        <li>CITIZENSHIP: ${nomadTransitionPill(row.nomadTransition)}<span class="subtext">${escapeHtml(row.nomadTransition.description)}</span></li>
        <li>CITIZENSHIP CATEGORY: ${escapeHtml(citizenshipCategoryLabel(row.citizenshipCategory))}</li>
        <li>CONFIDENCE: ${escapeHtml(String(data.confidence ?? "NOT FOUND").toUpperCase())}</li>
        <li>RESEARCHED AT: ${escapeHtml(data.researched_at ?? "NOT FOUND")}</li>
        <li>SOURCE COUNT: ${escapeHtml(String(row.sourceCount ?? sources.length ?? 0))}</li>
      </ul>
      <p class="summary">${escapeHtml(data.notes ?? "")}</p>
    </div>

    <div class="detail-block">
      <h3>DIGITAL NOMAD / REMOTE-WORK ROUTE</h3>
      <p>${escapeHtml(route?.route_name ?? "NOT FOUND")}</p>
      ${formatRouteFacts(route)}
      ${formatRouteRequirements(route)}
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
        <li>TAX: ${escapeHtml(formatTax(row))}</li>
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
      <h3>COUNTRY SETTLEMENT CONTEXT</h3>
      <p class="explain">These country-level findings can describe another route. The CIT column above applies only to the displayed nomad / remote-work route.</p>
      <p class="explain">${escapeHtml(citizenshipTrackDescription(row.citizenshipTrack))}</p>
      <ul class="detail-list">
        <li>TRACK: ${citizenshipTrackPill(row.citizenshipTrack)}</li>
        <li>RAW TRACK: ${escapeHtml(data.settlement_track?.classification ?? "NOT FOUND")}</li>
        <li>TRACK STRENGTH: ${escapeHtml(data.settlement_track?.citizenship_track_strength ?? data.citizenship_track_strength ?? "NOT FOUND")}</li>
        <li>CITIZENSHIP FROM THIS ROUTE: ${escapeHtml(formatCitizenshipTrack(data.settlement_track?.can_lead_to_citizenship_from_this_route))}</li>
        <li>CITIZENSHIP STATUS SWITCH NEEDED: ${escapeHtml(formatBooleanish(data.settlement_track?.requires_switch_to_another_status))}</li>
        <li>NOMAD WARNING: ${escapeHtml(data.settlement_track?.nomad_only_warning ?? "NOT FOUND")}</li>
      </ul>
      <p>${escapeHtml(data.timeline?.key_conditions?.value ?? "NOT FOUND.")}</p>
      <p class="summary">${escapeHtml(data.settlement_track?.summary ?? "")}</p>
    </div>

    <div class="detail-block">
      <h3>COUNTRY CITIZENSHIP TIMELINE</h3>
      <p class="explain">General or alternative-route timelines are preserved here; they are shown in the table only for a confirmed nomad / remote-work citizenship path.</p>
      <ul class="detail-list">
        <li>TOTAL YEARS: ${formatSourcedInline(data.timeline?.total_years_to_citizenship, (value) => `${value} YRS`)}</li>
        <li>PERMANENT RESIDENCE YEARS: ${formatSourcedInline(data.timeline?.permanent_residence_years, (value) => `${value} YRS`)}</li>
        <li>DUAL CITIZENSHIP: ${formatSourcedInline(data.timeline?.dual_citizenship)}</li>
        <li>PROCESSING TIME: ${formatSourcedInline(data.timeline?.citizenship_processing_time)}</li>
        <li>NOMAD ROUTE: ${formatSourcedInline(data.timeline?.citizenship_via_nomad_route)}</li>
        <li>ROUTE REALISM: ${formatSourcedInline(data.timeline?.citizenship_route_realism)}</li>
      </ul>
      <p class="summary">${escapeHtml(data.timeline?.status_transition_notes?.value ?? "")}</p>
    </div>

    <div class="detail-block">
      <h3>MARRIAGE AND CHILD</h3>
      <p class="explain">Family data separates child citizenship, parent residence benefit, and marriage shortcuts. A citizen child or spouse usually does not mean automatic citizenship for the applicant.</p>
      <ul class="detail-list">
        <li>CHILD BIRTHRIGHT: ${formatSourcedInline(data.child_citizenship?.birthright_citizenship)}</li>
        <li>IF BOTH PARENTS MIGRANTS: ${formatSourcedInline(data.child_citizenship?.if_both_parents_migrants)}</li>
        <li>IF SECOND PARENT LOCAL: ${formatSourcedInline(data.child_citizenship?.if_second_parent_local_citizen)}</li>
        <li>FATHER BENEFIT: ${formatSourcedInline(data.child_citizenship?.benefit_to_migrant_father)}</li>
        <li>MARRIAGE YEARS: ${formatSourcedInline(data.marriage?.years_to_citizenship_via_marriage, (value) => `${value} YRS`)}</li>
        <li>MARRIAGE BENEFIT: ${formatSourcedInline(data.marriage?.residence_benefit)}</li>
        <li>EXISTING MARRIAGE IMPACT: ${formatSourcedInline(data.marriage?.existing_marriage_impact)}</li>
      </ul>
      <p>${escapeHtml(data.marriage?.requirements_and_risks?.value ?? "NOT FOUND.")}</p>
      <p class="summary">${escapeHtml(data.marriage?.genuine_marriage_warning?.value ?? data.child_citizenship?.parent_benefit_summary?.value ?? "")}</p>
    </div>

    <div class="detail-block">
      <h3>PASSPORT AND LANGUAGES</h3>
      <p class="explain">Passport values come from the captured passport index source; language values are official languages, not a guarantee of practical English support.</p>
      <ul class="detail-list">
        <li>RANK: ${formatNullable(numberValue(data.passport?.rank), (value) => `#${value}`)}</li>
        <li>VISA-FREE: ${formatNullable(numberValue(data.passport?.visa_free_destinations), (value) => `${value} DESTINATIONS`)}</li>
        <li>LANGUAGES: ${escapeHtml((data.languages?.official_languages ?? []).join(", ") || "NOT FOUND")}</li>
        <li>PASSPORT NOTES: ${formatSourcedInline(data.passport?.notes)}</li>
      </ul>
    </div>

    <div class="detail-block">
      <h3>AVERAGE CITIZEN SALARY</h3>
      <p class="explain">Salary is for an average citizen or resident worker, not the immigration income threshold. Missing min/max means no reliable wage range has been captured yet.</p>
      ${formatAverageCitizenSalary(data.labor_market?.average_citizen_salary)}
      <p class="summary">${escapeHtml(data.labor_market?.software_engineer_notes ?? "")}</p>
    </div>

    <div class="detail-block">
      <h3>REJECTED ROUTES</h3>
      ${formatRejectedRoutes(data.rejected_routes)}
    </div>

    <div class="detail-block">
      <h3>SOURCES</h3>
      <p class="explain">Captured sources for this country. Prefer official immigration, tax, statistics, and law pages before acting.</p>
      <div class="sources">
        ${sources.length ? sources.map((source) => formatSourceLink(source.url, source.title || source.url)).join("") : '<p class="empty">NO SOURCES LISTED.</p>'}
      </div>
    </div>

    <div class="detail-block">
      <h3>FULL DATA</h3>
      ${formatFullData(data)}
    </div>
  `;
}

function statusPill(row) {
  if (row.status === "error") return '<span class="pill warn">RESEARCH ERROR</span>';
  if (row.valid === true) return '<span class="pill good">NOMAD / REMOTE-WORK ROUTE: YES</span>';
  return '<span class="pill bad">NOMAD / REMOTE-WORK ROUTE: NO</span>';
}

function matchesStatus(row, selected) {
  if (selected === "error") return row.status === "error";
  return String(row.valid) === selected;
}

function matchesCitizenshipFilter(row, selected) {
  if (selected.startsWith("category:")) {
    return row.citizenshipCategory === selected.slice("category:".length);
  }
  return row.nomadTransition.status === selected;
}

function statusRank(row) {
  if (row.status === "error") return 5;
  if (row.valid === true) return 1;
  if (row.valid === false) return 4;
  if (row.status === "error") return 5;
  return 6;
}

function syncLanguageFilterOptions() {
  const current = elements.language.value;
  const languages = Array.from(new Set(
    state.rows.flatMap((row) => row.languages.map(languageKey)).filter(Boolean)
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
  return row.languages.some((language) => languageKey(language).toLowerCase() === languageKey(selected).toLowerCase());
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

function citizenshipCategoryLabel(value) {
  if (value === "research_error") return "RESEARCH ERROR";
  if (value === "confirmed") return "CONFIRMED TRACK";
  if (value === "temporary_only") return "TEMPORARY / NON-COUNTING";
  if (value === "separate_profile_route") return "SEPARATE / PROFILE-CHANGING ROUTE";
  if (value === "unconfirmed") return "UNCONFIRMED";
  if (value === "no_visa") return "NO NOMAD VISA";
  return "UNKNOWN";
}

function nomadTransitionRank(value) {
  if (value === "direct") return 1;
  if (value === "no_citizenship_path") return 2;
  if (value === "no_nomad_route") return 3;
  return 4;
}

function nomadTransitionPill(transition) {
  return `<span class="pill ${transition.tone}">${escapeHtml(transition.label)}</span>`;
}

function jusSoliRank(value) {
  if (value === true) return 1;
  if (value === false) return 2;
  return 3;
}

function jusSoliLabel(value) {
  if (value === true) return "YES";
  if (value === false) return "NO";
  return "UNCERTAIN";
}

function jusSoliFilterValue(value) {
  if (value === true) return "yes";
  if (value === false) return "no";
  return "uncertain";
}

function jusSoliTone(value) {
  if (value === true) return "good";
  if (value === false) return "bad";
  return "warn";
}

function jusSoliPill(value) {
  return `<span class="pill ${jusSoliTone(value)}">${escapeHtml(jusSoliLabel(value))}</span>`;
}

function parseOptionalNumber(value) {
  if (value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function formatNullable(value, formatter) {
  return value === null || value === undefined ? "NOT FOUND" : escapeHtml(formatter(value));
}

function formatIncome(row) {
  if (row.income !== null && row.income !== undefined) return `${money(row.income)} / MO`;
  return row.incomeText || "NOT FOUND";
}

function formatTax(row) {
  if (row.tax !== null && row.tax !== undefined) return `${row.tax}%`;
  return row.taxText || "NOT FOUND";
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
  if (!languages.length) return '<span class="language-chip">NOT FOUND</span>';

  const visibleLanguages = languages.slice(0, 1);
  const remainingCount = languages.length - visibleLanguages.length;
  const chips = visibleLanguages.map((language) => `<span class="language-chip">${escapeHtml(language)}</span>`);

  if (remainingCount > 0) {
    chips.push(`<span class="language-chip more">+${remainingCount} MORE</span>`);
  }

  return chips.join("");
}

function formatResearchQuality(row) {
  const confidence = row.confidence ? String(row.confidence).toUpperCase() : "NOT FOUND";
  return `RESEARCH QUALITY: ${confidence} · ${row.sourceCount} SOURCES`;
}

function formatStatusMeaning(row) {
  if (row.valid === true) {
    return "YES means a recorded digital-nomad or equivalent foreign-remote-worker visa/status is confirmed. CITIZENSHIP is YES only when that same route has a confirmed, cited citizenship path; conditions and any required status switch still apply.";
  }
  return "NO means no recorded digital-nomad or equivalent foreign-remote-worker visa/status is confirmed. Other skilled, business, investor, visitor, or ordinary residence routes are excluded.";
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

function formatRouteRequirements(route) {
  if (!route) return "";

  return `
    <ul class="detail-list compact">
      <li>MINIMUM INCOME USD: ${formatSourcedInline(route.minimum_monthly_income_usd, (value) => `${money(value)} / MO`)}</li>
      <li>MINIMUM INCOME LOCAL: ${formatSourcedInline(route.minimum_income_local_currency)}</li>
      <li>INCOME PROOF MONTHS: ${formatSourcedInline(route.income_proof_months, (value) => `${value} MO`)}</li>
      <li>INITIAL VALIDITY: ${formatSourcedInline(route.initial_validity)}</li>
      <li>EXTENSION: ${formatSourcedInline(route.extension_rules ?? route.initial_validity)}</li>
      <li>TEMPORARY PATH: ${formatSourcedInline(route.path_to_temporary_residence)}</li>
      <li>PERMANENT PATH: ${formatSourcedInline(route.path_to_permanent_residence)}</li>
      <li>CITIZENSHIP PATH: ${formatSourcedInline(route.path_to_citizenship)}</li>
    </ul>
    ${formatKeyRequirements(route.key_requirements)}
  `;
}

function formatKeyRequirements(requirements) {
  if (!Array.isArray(requirements) || requirements.length === 0) {
    return '<p class="empty compact">KEY REQUIREMENTS NOT FOUND.</p>';
  }

  return `
    <ul class="detail-list compact">
      ${requirements.map((item) => `
        <li>REQUIREMENT: ${escapeHtml(item.requirement ?? String(item))}
          ${formatSourceIds(item.source_ids)}
        </li>
      `).join("")}
    </ul>
  `;
}

function formatRejectedRoutes(routes) {
  if (!Array.isArray(routes) || routes.length === 0) {
    return '<p class="empty compact">NO REJECTED ROUTES CAPTURED.</p>';
  }

  return `
    <ul class="detail-list compact">
      ${routes.map((route) => `
        <li>
          <strong>${escapeHtml(route.route_name ?? route.name ?? "UNNAMED ROUTE")}</strong>
          <span class="subtext">${escapeHtml(route.reason ?? route.notes ?? "REASON NOT FOUND")}</span>
          ${formatSourceIds(route.source_ids)}
        </li>
      `).join("")}
    </ul>
  `;
}

function formatFullData(data) {
  return `
    <details class="full-data">
      <summary>NORMALIZED COUNTRY RECORD</summary>
      <pre>${escapeHtml(JSON.stringify(data, null, 2))}</pre>
    </details>
  `;
}

function formatRemoteWorkFit(fit) {
  if (fit && typeof fit === "object") {
    const notes = fit.notes ? `<span class="subtext">${escapeHtml(fit.notes)}</span>` : "";
    return `${escapeHtml(formatBooleanish(fit.value))}${notes}`;
  }

  return escapeHtml(formatBooleanish(fit));
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
  if (!safeHttpUrl(application?.application_url)) {
    return `
      <p class="empty compact">OFFICIAL APPLICATION LINK NOT FOUND.</p>
      <p class="summary">${escapeHtml(application?.notes ?? "")}</p>
    `;
  }

  return `
    <div class="sources">
      <a href="${escapeAttr(safeHttpUrl(application.application_url))}" target="_blank" rel="noreferrer">
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
      <li>PERIOD: ${escapeHtml(String(salary.period ?? "NOT FOUND").toUpperCase())}</li>
      <li>CONFIDENCE: ${escapeHtml(String(salary.confidence ?? "NOT FOUND").toUpperCase())}</li>
    </ul>
    <p class="summary">${escapeHtml(salary.notes ?? "")}</p>
  `;
}

function formatSourcedInline(item, formatter) {
  if (item === null || item === undefined || item === "") return "NOT FOUND";

  if (typeof item !== "object" || Array.isArray(item)) {
    const value = formatter ? formatter(item) : String(item);
    return escapeHtml(value);
  }

  const rawValue = item.display_value ?? item.value ?? item.local_or_formula_value ?? item.status;
  const displayValue = rawValue === null || rawValue === undefined || rawValue === ""
    ? "NOT FOUND"
    : formatter && typeof rawValue === "number"
      ? formatter(rawValue)
      : String(rawValue);
  const notes = item.notes ? `<span class="subtext">${escapeHtml(item.notes)}</span>` : "";
  return `${escapeHtml(displayValue)}${notes}${formatSourceIds(item.source_ids)}`;
}

function formatSourceIds(sourceIds) {
  if (!Array.isArray(sourceIds) || sourceIds.length === 0) return "";
  return `<span class="source-ids">${escapeHtml(sourceIds.join(", "))}</span>`;
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

function formatSourceLink(url, title) {
  const safeUrl = safeHttpUrl(url);
  return safeUrl ? `<a href="${escapeAttr(safeUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(title)}</a>` : `<span>${escapeHtml(title)} (INVALID SOURCE URL)</span>`;
}
