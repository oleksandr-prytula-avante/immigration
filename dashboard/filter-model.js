import { compareNullableNumbers, languageKey, matchesMaximum } from "./dataset-model.js";

export function normalizeCitizenshipFilter(value) {
  const legacy = {
    direct: "confirmed", "category:confirmed": "confirmed",
    no_citizenship_path: "not_confirmed", "category:temporary_only": "not_confirmed",
    "category:separate_profile_route": "conditional", "category:unconfirmed": "unconfirmed",
    uncertain: "unconfirmed", no_nomad_route: "not_applicable", "category:no_visa": "not_applicable"
  };
  return legacy[value] ?? value;
}

export function parseMaximum(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function filterDashboardRows(rows, filters = {}) {
  const selected = key => filters[key] || "all";
  const query = String(filters.search ?? "").trim().toLocaleLowerCase();
  const cit = normalizeCitizenshipFilter(selected("citizenship"));
  return rows.filter(row => {
    const haystack = [row.country, row.summary, row.bestRouteName, row.bestRouteType,
      row.nomadTransition.label, row.nomadTransition.fullLabel, row.nomadTransition.description,
      row.prTransition.label, row.prTransition.fullLabel, row.prTransition.summary,
      row.citizenshipYearsText, row.languages.join(" "), row.data.notes].join(" ").toLocaleLowerCase();
    if (query && !haystack.includes(query)) return false;
    const visa = selected("visa");
    if (visa !== "all" && (visa === "error" ? row.status !== "error" : visa === "uncertain" ? row.availability !== "unconfirmed" : String(row.valid) !== visa)) return false;
    const language = selected("language");
    if (language !== "all" && (language === "missing" ? row.languages.length !== 0 :
      !row.languages.some(name => languageKey(name).toLocaleLowerCase() === languageKey(language).toLocaleLowerCase()))) return false;
    if (cit === "not_confirmed" ? !["conditional", "unconfirmed", "not_available"].includes(row.nomadTransition.status) :
      cit !== "all" && row.nomadTransition.status !== cit) return false;
    if (selected("pr") !== "all" && row.prTransition.status !== filters.pr) return false;
    const jusSoli = row.jusSoli === true ? "yes" : row.jusSoli === false ? "no" : "uncertain";
    if (selected("jusSoli") !== "all" && jusSoli !== filters.jusSoli) return false;
    return matchesMaximum(row.income, parseMaximum(filters.incomeMax)) &&
      matchesMaximum(row.tax, parseMaximum(filters.taxMax)) &&
      matchesMaximum(row.citizenshipYears, parseMaximum(filters.citizenshipMax));
  });
}

export function compareDashboardRows(a, b, sort = {}) {
  const direction = sort.direction === "desc" ? -1 : 1;
  const key = sort.key || "citizenship";
  const numeric = { income: "income", tax: "tax", citizenship: "citizenshipYears" };
  let primary = 0;
  if (numeric[key]) primary = compareNullableNumbers(a[numeric[key]], b[numeric[key]], direction);
  else if (key === "country") primary = a.country.localeCompare(b.country, "en") * direction;
  else {
    const rank = row => {
      if (key === "prPath") return row.prTransition.rank;
      if (["nomadTransition", "citizenshipTrack"].includes(key)) return row.nomadTransition.rank;
      if (key === "valid") return row.valid === true ? 1 : row.valid === false ? 2 : 3;
      if (key === "jusSoli") return row.jusSoli === true ? 1 : row.jusSoli === false ? 2 : 3;
      return 0;
    };
    primary = (rank(a) - rank(b)) * direction;
  }
  return primary || a.country.localeCompare(b.country, "en");
}
