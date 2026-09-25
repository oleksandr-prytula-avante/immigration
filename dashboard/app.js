import { normalizeResults, numberValue, recordedPeriodText, safeHttpUrl, languageKey } from "./dataset-model.js";
import { filterDashboardRows, compareDashboardRows, normalizeCitizenshipFilter } from "./filter-model.js";

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
  prPath: document.querySelector("#prPathFilter"),
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
    const prReviewDate = data.meta?.digital_nomad_pr_review?.reviewed_at;
    const citReviewDate = data.meta?.digital_nomad_citizenship_review?.reviewed_at;
    loadDataset(data, `RESEARCH DATA LOADED · FULL RESEARCH ${data.meta?.last_full_research_date ?? "DATE NOT RECORDED"}${prReviewDate ? ` · NOMAD → PR REVIEW ${prReviewDate}` : ""}${citReviewDate ? ` · CIT CHAIN REVIEW ${citReviewDate}` : ""}`);
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
    elements.prPath,
    elements.jusSoli,
    elements.incomeMax,
    elements.taxMax,
    elements.citizenshipMax
  ];

  resettableFilters.forEach((input) => {
    input.addEventListener(filterEventName(input), () => {
      if ([elements.prCit, elements.prPath].includes(input) && ["not_applicable", "research_error"].includes(input.value)) elements.valid.value = "all";
      if (input === elements.valid && input.value !== "all") {
        for (const filter of [elements.prCit, elements.prPath]) {
          if ((filter.value === "not_applicable" && input.value !== "false") ||
              (filter.value === "research_error" && input.value !== "error")) filter.value = "all";
        }
      }
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
    prPath: params.get("prPath"),
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
  setSelectValue(elements.prPath, urlState.prPath);
  if ([elements.prCit, elements.prPath].some(filter => ["not_applicable", "research_error"].includes(filter.value)) && urlState.status === null) elements.valid.value = "all";
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
  setUrlParam(params, "prPath", elements.prPath.value, "all");
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
  const normalized = select === elements.prCit ? normalizeCitizenshipFilter(value) : value;
  if (normalized !== null && Array.from(select.options).some(option => option.value === normalized)) select.value = normalized;
}

function setUrlParam(params, key, value, defaultValue = "") {
  if (value !== null && value !== undefined && value !== "" && value !== defaultValue) {
    params.set(key, value);
  }
}

function isValidSortKey(key) {
  return ["country", "valid", "income", "tax", "citizenship", "jusSoli", "citizenshipTrack", "nomadTransition", "prPath"].includes(key);
}

function filteredRows() {
  return filterDashboardRows(state.rows, {
    search: elements.search.value, visa: elements.valid.value, language: elements.language.value,
    citizenship: elements.prCit.value, pr: elements.prPath.value, jusSoli: elements.jusSoli.value,
    incomeMax: elements.incomeMax.value, taxMax: elements.taxMax.value, citizenshipMax: elements.citizenshipMax.value
  });
}

function compareRows(a, b) {
  return compareDashboardRows(a, b, state.sort);
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
    elements.rows.innerHTML = '<tr><td colspan="8">NO COUNTRIES MATCH THE SELECTED FILTERS.</td></tr>';
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
      <td class="nomad-col" title="${escapeAttr(row.nomadTransition.description)}">${nomadTransitionPill(row.nomadTransition)}</td>
      <td class="years-col" data-years="${row.citizenshipYears ?? ""}">${formatCitizenshipYears(row, true)}</td>
      <td class="pr-col" title="${escapeAttr(row.prTransition.summary)}">${nomadTransitionPill(row.prTransition)}</td>
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

    ${formatPrReview(row.prTransition)}
    ${formatCitizenshipReview(row.nomadTransition)}

    <div class="detail-block">
      <h3>COUNTRY OVERVIEW</h3>
      <ul class="detail-list">
        <li>NOMAD / REMOTE-WORK ROUTE: ${escapeHtml(row.valid === true ? "YES" : row.availability === "unconfirmed" ? "UNCONFIRMED" : "NO")}</li>
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
      <p class="explain">Income is the route threshold, tax is the top or screening personal rate, and citizenship years are the recorded country timeline, independent of the CIT status.</p>
      <ul class="detail-list">
        <li>INCOME: ${escapeHtml(formatIncome(row))}</li>
        <li>INCOME PROOF: ${escapeHtml(formatIncomeProof(route))}</li>
        <li>TAX: ${escapeHtml(formatTax(row))}</li>
        <li>CITIZENSHIP TIMELINE: ${formatCitizenshipYears(row)}</li>
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
      <p class="explain">These broader country findings may describe a different route or earlier research. The dated citizenship-chain review above determines CIT and includes eligible successor statuses.</p>
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
      <p class="explain">YEARS shows the recorded country timeline regardless of CIT status. These notes explain the relevant route and conditions.</p>
      <ul class="detail-list">
        <li>TOTAL YEARS: ${formatRecordedPeriod(data.timeline?.total_years_to_citizenship)}</li>
        <li>TO TEMPORARY RESIDENCE: ${formatRecordedPeriod(data.timeline?.years_to_temporary_residence)}</li>
        <li>TO PR AFTER TEMPORARY RESIDENCE: ${formatRecordedPeriod(data.timeline?.years_to_permanent_residence_after_temporary ?? data.timeline?.permanent_residence_years)}</li>
        <li>TO CITIZENSHIP AFTER PR: ${formatRecordedPeriod(data.timeline?.years_to_citizenship_after_permanent_residence)}</li>
        <li>PROCESSING TIME: ${formatRecordedPeriod(data.timeline?.typical_citizenship_processing_time_months ?? data.timeline?.citizenship_processing_time, "MONTHS")}</li>
      </ul>
      <p class="summary">${formatSourcedInline(data.timeline?.key_conditions ?? data.timeline?.status_transition_notes)}</p>
    </div>

    <div class="detail-block">
      <h3>MARRIAGE AND CHILD</h3>
      <p class="explain">Family data separates child citizenship, parent residence benefit, and marriage shortcuts. A citizen child or spouse usually does not mean automatic citizenship for the applicant.</p>
      <ul class="detail-list">
        <li>CHILD BIRTHRIGHT: ${formatSourcedInline(data.child_citizenship?.birthright_citizenship)}</li>
        <li>IF BOTH PARENTS MIGRANTS: ${formatSourcedInline(data.child_citizenship?.if_both_parents_migrants)}</li>
        <li>IF SECOND PARENT LOCAL: ${formatSourcedInline(data.child_citizenship?.if_second_parent_local_citizen)}</li>
        <li>FATHER BENEFIT: ${formatSourcedInline(data.child_citizenship?.benefit_to_migrant_father)}</li>
        <li>MARRIAGE YEARS: ${formatRecordedPeriod(data.marriage?.years_of_marriage_or_residence_required ?? data.marriage?.years_to_citizenship_via_marriage)}</li>
        <li>ACCELERATES CITIZENSHIP OR PR: ${escapeHtml(formatBooleanish(data.marriage?.accelerates_citizenship_or_pr))}</li>
        <li>EXISTING MARRIAGE IMPACT: ${formatSourcedInline(data.marriage?.existing_marriage_effect ?? data.marriage?.existing_marriage_impact)}</li>
      </ul>
      <p>${escapeHtml(data.marriage?.requirements_and_risks?.value ?? "NOT FOUND.")}</p>
      <p class="summary">${escapeHtml(data.marriage?.genuine_marriage_warning?.value ?? data.child_citizenship?.parent_benefit_summary?.value ?? "")}</p>
    </div>

    <div class="detail-block">
      <h3>PASSPORT AND LANGUAGES</h3>
      <p class="explain">Passport values come from the captured passport index source; language values are official languages, not a guarantee of practical English support.</p>
      <ul class="detail-list">
        <li>INDEX: ${escapeHtml(data.passport?.index_name ?? "NOT RECORDED")}</li>
        <li>RANK: ${formatSourcedInline(data.passport?.rank, (value) => `#${value}`)}</li>
        ${data.passport?.mobility_score ? `<li>ACCESS SCORE (COMBINED): ${formatRecordedPeriod(data.passport.mobility_score, "DESTINATIONS")}</li>` : ""}
        <li>STRICTLY VISA-FREE: ${formatRecordedPeriod(data.passport?.visa_free_destinations, "DESTINATIONS")}</li>
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
  if (row.availability === "unconfirmed") return '<span class="pill warn">NOMAD ROUTE AVAILABILITY: UNCONFIRMED</span>';
  return '<span class="pill bad">NOMAD / REMOTE-WORK ROUTE: NO</span>';
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
  if (value === "conditional") return "CONDITIONAL — ADDITIONAL ELIGIBILITY";
  if (value === "not_available") return "NO SUPPORTED PATH";
  if (value === "unconfirmed") return "UNCONFIRMED";
  if (value === "no_visa") return "NO NOMAD VISA";
  return "UNKNOWN";
}

function nomadTransitionPill(transition) {
  const description = transition.fullLabel ? ` title="${escapeAttr(transition.fullLabel)}" aria-label="${escapeAttr(transition.fullLabel)}"` : "";
  return `<span class="pill ${transition.tone}"${description}>${escapeHtml(transition.label)}</span>`;
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

function formatNullable(value, formatter) {
  return value === null || value === undefined ? "NOT FOUND" : escapeHtml(formatter(value));
}

function formatCitizenshipYears(row, compact = false) {
  if (row.citizenshipYears !== null) return `${row.citizenshipYears} YRS`;
  const text = row.citizenshipYearsText ?? (row.status === "error" ? "RESEARCH ERROR" : "NOT RECORDED");
  if (compact && text.trim().length > 60) {
    return `<button type="button" class="timeline-note-icon" title="${escapeAttr(text)}" aria-label="${escapeAttr(`Citizenship timeline for ${row.country}: ${text}`)}" aria-controls="detailsPanel">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6" />
        <circle cx="12" cy="7.5" r="1" fill="currentColor" stroke="none" />
      </svg>
    </button>`;
  }
  return compact
    ? `<span class="timeline-note" title="${escapeAttr(text)}">${escapeHtml(text)}</span>`
    : escapeHtml(text);
}

function formatRecordedPeriod(item, unit = "YRS") {
  if (numberValue(item) !== null) return formatSourcedInline(item, value => `${value} ${unit}`);
  const text = recordedPeriodText(item);
  return `${escapeHtml(text ?? "NOT RECORDED")}${formatSourceIds(item?.source_ids)}`;
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
  if (row.availability === "unconfirmed") return "A legal or announced nomad framework is recorded, but current programme operation or the application channel is not established. This does not confirm availability.";
  if (row.valid === true) {
    return "YES means a recorded digital-nomad or equivalent foreign-remote-worker visa/status is confirmed. PR PATH and CIT review the complete sequence, including a separate application or status switch that preserves foreign remote work. Citizenship requires its own evidence; PR alone is insufficient.";
  }
  return "NO means no recorded digital-nomad or equivalent foreign-remote-worker visa/status is confirmed. Other skilled, business, investor, visitor, or ordinary residence routes are excluded.";
}

function formatRouteFacts(route) {
  if (!route) return '<p class="empty compact">ROUTE DETAILS NOT FOUND.</p>';

  return `
    <ul class="detail-list compact">
      <li>TYPE: ${escapeHtml(route.route_type ?? "NOT FOUND")}</li>
      ${route.availability ? `<li>PROGRAMME AVAILABILITY: ${formatSourcedInline(route.availability)}</li>` : ""}
      <li>INDEPENDENT APPLICATION: ${escapeHtml(formatBooleanish(route.independent_application_possible))}</li>
      <li>LOCAL EMPLOYER REQUIRED: ${escapeHtml(formatBooleanish(route.local_employer_required))}</li>
      <li>FOREIGN CONTRACT / INCOME: ${escapeHtml(formatBooleanish(route.foreign_contract_or_income_required))}</li>
      <li>TEMPORARY RESIDENCE GRANTED BY INITIAL ROUTE: ${escapeHtml(formatBooleanish(route.direct_temporary_residence_possible))}</li>
      <li>PR GRANTED BY INITIAL ROUTE: ${escapeHtml(formatBooleanish(route.direct_permanent_residence_possible))}</li>
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
    return "Strong means the full citizenship chain is confirmed for the assessed profile, subject to its residence, language and other conditions.";
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
  if (value === false) return "NO CONFIRMED PATH IN THIS COUNTRY-LEVEL ASSESSMENT";
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

function formatPrReview(transition) {
  const review = transition.review;
  return `<div class="detail-block">
    <h3>PERMANENT RESIDENCE AFTER NOMAD</h3>
    ${nomadTransitionPill(transition)}
    <p class="summary">${escapeHtml(transition.summary)}</p>
    ${review ? `<ul class="detail-list">
      <li>SUCCESSOR STATUS: ${escapeHtml(review.qualifying_status ?? "NO CONFIRMED STATUS")}</li>
      <li>REMOTE-WORK PROFILE: ${escapeHtml(formatBooleanish(review.remote_work_profile_supported))}</li>
      <li>STATUS SWITCH: ${escapeHtml(formatBooleanish(review.requires_status_switch))}</li>
      <li>EXIT REQUIRED: ${escapeHtml(formatBooleanish(review.requires_exit))}</li>
      <li>NOMAD TIME COUNTS TOWARD PR: ${escapeHtml(formatBooleanish(review.nomad_time_counts_toward_pr))}</li>
      <li>QUALIFYING YEARS TO PR: ${formatRecordedPeriod({value: review.years_to_pr, notes: review.years_to_pr === null ? review.notes : null})}</li>
      <li>REVIEWED: ${escapeHtml(review.reviewed_at)}</li>
    </ul>
    <ul class="detail-list compact">${(Array.isArray(review.requirements) ? review.requirements : []).map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    ${review.years_to_pr !== null ? `<p class="summary">${escapeHtml(review.notes)}</p>` : ""}
    ${formatSourceIds(review.source_ids)}` : ""}
  </div>`;
}

function formatCitizenshipReview(transition) {
  const review = transition.review;
  return `<div class="detail-block">
    <h3>CITIZENSHIP AFTER NOMAD</h3>
    ${nomadTransitionPill(transition)}
    <p class="summary">${escapeHtml(transition.description)}</p>
    ${review ? `<ul class="detail-list">
      <li>QUALIFYING STATUS: ${escapeHtml(review.qualifying_status ?? "NOT ESTABLISHED")}</li>
      <li>REMOTE-WORK PROFILE: ${escapeHtml(formatBooleanish(review.remote_work_profile_supported))}</li>
      <li>STATUS SWITCH: ${escapeHtml(formatBooleanish(review.requires_status_switch))}</li>
      <li>EXIT REQUIRED: ${escapeHtml(formatBooleanish(review.requires_exit))}</li>
      <li>PR REQUIRED FOR CITIZENSHIP: ${escapeHtml(formatBooleanish(review.requires_permanent_residence))}</li>
      <li>NOMAD TIME COUNTS TOWARD CITIZENSHIP: ${escapeHtml(formatBooleanish(review.nomad_time_counts_toward_citizenship))}</li>
      <li>MINIMUM QUALIFYING YEARS IN THIS CHAIN: ${formatRecordedPeriod({value: review.years_to_citizenship, notes: review.years_to_citizenship === null ? review.notes : null})}</li>
      <li>REVIEWED: ${escapeHtml(review.reviewed_at)}</li>
    </ul>
    <p class="explain">Qualifying residence excludes application processing and any optional initial stay. The separate YEARS column preserves the recorded country timeline, which may describe another route.</p>
    <ul class="detail-list compact">${review.requirements.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    ${review.years_to_citizenship !== null ? `<p class="summary">${escapeHtml(review.notes)}</p>` : ""}
    ${formatSourceIds(review.source_ids)}` : ""}
  </div>`;
}
