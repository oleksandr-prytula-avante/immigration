You are doing current immigration research for this country: {{COUNTRY}}.

Research date: {{TODAY}}. Use the freshest available information. Use web search and verify primary or official sources whenever possible: immigration authority websites, consulates, tax authorities, official government portals, laws, and international passport indexes. If you use a non-official source, mark that in `notes` and lower confidence.

Applicant context:
- Profession: software engineer.
- Has a relevant university degree.
- Has an active contract with a foreign client or foreign employer outside the researched country.
- Goal: find countries where the applicant can apply independently without a local employer.
- Treat the profile as ordinary foreign-contract remote work: the applicant works remotely for a foreign client or employer. Do not treat routes as eligible if they require elite talent, founder/startup status, investor/golden visa status, venture funding, local company hiring, prospective local employment, local-client/host-country assignment, exceptional achievements, points-tested/skilled migration invitation, or substantial capital investment, unless there is a separate ordinary remote-worker/freelance/self-employed option.
- Important: programs requiring a job offer, work permit sponsorship, labor market test, or local-employer visa are not valid for this selection, even if they can fit software engineers.
- Final selection is citizenship-path oriented. A country is not eligible just because the applicant can live there temporarily, work remotely as a visitor, or use a digital-nomad/workcation status. The chosen route must either be a qualifying residence route itself or have a confirmed conversion path into qualifying residence for permanent residence/citizenship.
- Independent skilled-worker / points-tested / degree-based migration routes may be marked `valid_for_selection="partial"` when they can be applied for without a local employer and can lead directly to residence/permanent residence/citizenship, but they are not ordinary foreign-contract remote-work routes. Example: Australia subclass 189-style skilled independent PR.
- Dashboard interpretation: `valid_for_selection="partial"` and `valid_for_selection="uncertain"` are shown together as `REVIEW / PARTIAL`. Partial means "interesting independent skilled/residence route, not a remote-work match"; uncertain means "needs source/manual verification".

What to research:
1. Whether there is an independent self-application route:
   - Digital nomad visa, remote worker visa, freelance/self-employed visa, independent visa, entrepreneur/sole proprietor route, or residence permit for independent professionals.
   - Whether this scenario is possible: enter as a visitor, open a bank account, register as a sole proprietor / freelancer / self-employed person, and then legalize residence.
   - If the country only has employer-sponsored routes, clearly set `valid_for_selection=false`.
   - If the country only allows visitor/eVisa/visa-free/standard visitor remote work, clearly set `valid_for_selection=false` even if remote work is tolerated.
2. Whether there is a separate independent route that truly fits an ordinary foreign-contract remote worker. Points-based migration, skilled migration, talent routes, founder/startup routes, and investor/golden routes may be described only as rejected or alternative routes. Do not set `valid_for_selection=true` for the current profile unless the route is an ordinary remote-worker/freelance/self-employed application.
   - If a points-based/skilled/degree route is independent, does not require a local employer sponsor, and grants or can lead directly to qualifying residence/permanent residence, set `valid_for_selection="partial"` rather than `false`. Explain that it is useful for an IT/skilled profile but not a remote-work match.
3. For each potentially suitable route:
   - program name;
   - status type: visa, temporary residence, permanent residence, freelancer status, entrepreneur status, citizenship, or other;
   - official application link: direct online application portal if available; otherwise the official route page or official visa/immigration authority page where the applicant starts or verifies the application;
   - whether the application link is `direct_application`, `official_route_info`, `official_general_visa_portal`, `official_immigration_home`, or `not_found`;
   - whether the applicant can apply independently;
   - whether a local employer is required;
   - whether a foreign contract is required;
   - minimum monthly income in USD;
   - minimum income in local currency;
   - UI display value for income: if there is no USD threshold, use local currency; if no threshold is published, state that clearly in `income_requirement_display`;
   - how many months of income must be proven;
   - other key requirements: degree, experience, insurance, accommodation, criminal record certificate, bank balance, business plan, sole-proprietor registration, tax number, local address;
   - initial status duration and renewal rules.
4. Taxes:
   - when tax residency starts;
   - personal income tax rate on this type of income, as a percentage;
   - whether the system is flat, progressive, territorial/remittance-based, no personal income tax, or special-regime based;
   - if taxation is progressive, capture the bracket/range structure where available: rate percentage, threshold/range in local currency, approximate USD threshold if reliable, and whether the dashboard numeric tax value is the top marginal/screening rate rather than the expected effective rate;
   - social contributions / fixed payments / minimum monthly payments;
   - separately check fixed payments for the digital nomad / self-employed scenario: mandatory health insurance, social security, minimum monthly contribution, flat/fixed freelancer tax, municipal/business registration fee, visa/residence-card fees, renewal fees, stamp duties, VAT registration thresholds, financial transaction taxes;
   - whether there are special regimes for digital nomads, freelancers, expatriates, remittance basis, territorial tax, non-dom, or tax holidays;
   - include caveats because tax depends on residence, contract structure, and double-tax treaty position.
5. Status transitions:
   - whether this visa/status can transition to residence;
   - whether it can transition to permanent residence;
   - years to residence, then permanent residence, then citizenship;
   - typical citizenship processing time after application;
   - requirements: language, integration, physical presence, absence limits, income, tax compliance, renunciation of previous citizenship.
   - Always separate the right to live temporarily on a digital nomad / remote worker visa from a real path to permanent residence or citizenship. If the route is temporary only and does not lead to settlement, explicitly classify it as `temporary_nomad_only`.
   - Verify whether time spent on the route counts toward permanent residence or citizenship. If official sources do not confirm that it counts, do not mark it as a fully matched citizenship path.
6. Marriage:
   - whether citizenship or permanent residence is accelerated by marriage to a citizen;
   - whether an already existing marriage matters;
   - how many years of marriage/cohabitation are required;
   - whether residence, language, or integration requirements still apply;
   - warn about genuine-marriage checks and sham-marriage risks.
7. Child citizenship by birth:
   - whether the country uses jus soli, jus sanguinis, or a mixed system;
   - always fill `child_citizenship.birthright_citizenship.value` with one of: `unconditional_jus_soli`, `conditional_jus_soli`, `restricted_jus_soli`, `mostly_jus_sanguinis_or_conditional`, `jus_sanguinis_limited`, `restricted_jus_sanguinis`, or `uncertain`;
   - do not leave birthright citizenship as `not found`, `not researched`, empty, or vague. If official law is not captured, use a cautious classification and explain the missing source in `notes`;
   - for unrestricted/broad jus soli countries, use `unconditional_jus_soli` even when there are narrow diplomatic, foreign-government-service, enemy-occupation, or similar exceptions. Example: Canada is `unconditional_jus_soli` because the Citizenship Act grants citizenship to persons born in Canada, except narrow diplomatic/international-organization exceptions;
   - separately verify whether the country has conditional or restricted jus soli, such as parent residence/permanent-residence requirements, registration requirements, anti-statelessness-only rules, foundling rules, double jus soli, or age/election requirements;
   - whether a child gets citizenship if both parents are migrants;
   - whether a child gets citizenship if only the father is a migrant and the other parent is a local citizen or permanent resident;
   - whether birth of a citizen child gives the father advantages for residence, permanent residence, or citizenship. Do not imply that father citizenship is automatic just because the child is a citizen.
8. Passport:
   - passport rank in the Henley Passport Index or another named index;
   - number of visa-free destinations;
   - number of destinations requiring a visa in advance;
   - number of visa-on-arrival / eTA destinations, if the source separates them.
   - For countries passing selection, `rank` and `visa_free_destinations` must not remain empty. If Henley does not provide the needed breakdown, use a reliable passport index and cite the source.
9. Languages:
   - official national language(s);
   - how realistic it is to live and work remotely in English, Russian, or Ukrainian, if sources support that.
   - Always fill `languages.official_languages` for every country, even when the country is not eligible. Do not leave it empty and do not use vague values like "other official languages"; list the language names.
10. Economy:
   - average monthly salary for an average citizen/resident worker in USD and/or local currency;
   - median salary, if available;
   - minimum and maximum monthly salary/range when a reliable source publishes a national wage distribution, official wage bands, minimum wage, or average advertised salary range. Do not invent min/max. If only minimum wage is available, put it in the minimum field and explain that it is statutory minimum wage rather than observed minimum salary. If max is not meaningful or not published, use `null` and explain;
   - salary period and basis: monthly gross, monthly net, annual gross converted to monthly, minimum wage, formal-sector average, household survey, or job-advertisement average;
   - local currency amount and approximate USD conversion where reliable. If conversion is approximate, say so in notes;
   - brief cost-of-living note only if there is a reliable source.

Selection validity criteria:
- Set `valid_for_selection=true` only if there is at least one route where the applicant can apply independently without a local employer and that route is, or can convert into, a qualifying residence track for permanent residence/citizenship.
- Set `valid_for_selection="partial"` if the best route is an independent skilled-worker, points-tested, or qualification/degree-based route that does not require a local employer sponsor and can lead to residence/permanent residence/citizenship, but does not fit ordinary foreign-contract remote work. These routes are interesting but not fully matched.
- Set `valid_for_selection="uncertain"` only when the route may fit but current official/current sources are insufficient, contradictory, pending, or require filing-level/manual verification. Do not use `"uncertain"` for clearly temporary visitor/workcation options; those are `false`.
- A digital nomad route is valid only if it allows the applicant to live in the country with foreign contract/income and official/current sources confirm that the status can count toward, or convert into, a qualifying residence path. If it is temporary-only, visitor-like, workcation-only, or explicitly excluded from settlement, set `valid_for_selection=false`.
- A freelance/self-employed route is valid if the applicant can obtain status without a local employer and without a mandatory local client / host-country assignment / proof of substantial local economic interest that is incompatible with ordinary work for a foreign client.
- Visitor status, eVisa, visa-free stay, standard visitor remote-work permission, tourist extensions, workcation programs, and legacy/closed remote-work programs are not valid for selection. Put them in `rejected_routes` or keep them as contextual notes, but set `valid_for_selection=false`.
- Employer-sponsored skilled-worker routes are not valid for selection.
- Founder/startup, investor/golden visa, elite talent/high-achievement, points-tested/skilled migration invitation, ONE Pass/Tech.Pass-style, local employment, local-client assignment, or prospective local-employment routes are not valid for this selection unless they fit an ordinary foreign-contract remote worker without startup, investment, exceptional achievement, local work, or local customer requirements.
- Planned / announced / authorized-but-not-open programs are not valid for current selection: set `valid_for_selection=false` if there is no active official application channel or stable application rules.
- If information is contradictory or not confirmed by current official/current sources, set `valid_for_selection="uncertain"` and explain exactly what is missing. Use `"partial"` only for independent skilled/points/degree routes that are residence-oriented but not remote-work routes.

Citizenship path classification:
- For every country, fill `settlement_track.classification` with one of these values:
  - `strong_citizenship_track`: the chosen independent route is itself an ordinary/qualifying residence route and can realistically lead to permanent residence/citizenship if requirements are met.
  - `possible_with_conversion`: the country works for entry/residence, but citizenship usually requires switching to another qualifying residence / permanent residence status, or there is substantial uncertainty about whether this status counts.
  - `weak_or_uncertain_citizenship_track`: a route exists, but the link to permanent residence/citizenship is weak, disputed, discretionary, or requires separate legal verification.
  - `temporary_nomad_only`: the route is temporary, nomad/workcation/visitor-like, and should not be ranked as a citizenship path. This classification must normally have `valid_for_selection=false`.
  - `not_valid_no_regular_remote_work_route`: only visitor, eVisa, visa-free, tourist, workcation, legacy remote-work, employer-sponsored, investment, startup, elite, or other non-fitting routes were found for this profile.
  - `not_valid_no_current_route_confirmed`: no active independent route was found.
  - `not_valid_employer_or_job_offer_required`: only works through a local employer/job offer/sponsorship.
  - `not_valid_pending_implementation`: program has been announced or authorized by law but is not open for applications yet.
- Fill `settlement_track.can_lead_to_citizenship_from_this_route` as boolean or `"uncertain"`.
- Fill `settlement_track.requires_switch_to_another_status`.
- Fill `citizenship_track_strength`: `strong`, `possible_with_conversion`, `weak_or_uncertain`, `none_or_separate_route_required`, or `none`.
- Add `nomad_only_warning` if the chosen route is temporary and does not directly lead to permanent residence/citizenship.
- Set `regular_foreign_contract_remote_work_fit.value=true` only when the route fits ordinary foreign-client/foreign-employer remote work without local employer, local-client assignment, startup/founder/investor/elite requirements, or hidden local business-substance requirements.
- Set `valid_for_selection=true` only when `regular_foreign_contract_remote_work_fit.value=true`. If the value is `false` or `"needs_manual_review"`, `valid_for_selection` must be `false`, `"uncertain"`, or `"partial"` for independent skilled/points/degree routes, never `true`.
- Set `fully_matched=true` only if `valid_for_selection=true`, `settlement_track.classification` is `strong_citizenship_track` or `possible_with_conversion`, `regular_foreign_contract_remote_work_fit.value=true`, and official/current sources confirm a credible residence-to-citizenship route. In all other cases, set `fully_matched=false`.
- If `settlement_track.classification="temporary_nomad_only"`, then `valid_for_selection=false`, `fully_matched=false`, and `regular_foreign_contract_remote_work_fit.value` may be true only as a temporary-living fit, with notes saying it is not a citizenship-path fit.
- Dashboard `INTERESTING` filter includes: fully matched rows, plus `partial`, plus `uncertain`, but excludes `weak_or_uncertain_citizenship_track`. If a country is useful enough to be interesting, avoid `weak_or_uncertain_citizenship_track` unless it truly needs manual review and should be excluded from the default interesting view.

Final country audit before returning JSON:
- Re-read the chosen route and ask: "Is this only a visitor, visa-free, eVisa, standard visitor, tourist extension, workcation, or temporary digital-nomad stay?" If yes, set `valid_for_selection=false`.
- Ask: "Can this exact route count toward or convert into permanent residence/citizenship for an ordinary foreign-contract remote worker?" If not confirmed by official/current sources, do not mark it fully matched.
- Ask: "Does this require a local employer, local client, local assignment, investment, startup/founder role, elite-talent threshold, or points/invitation route?" If yes, set `valid_for_selection=false` unless a separate ordinary remote-worker/freelance route exists.
- Then ask: "Is this points/skilled/degree route independent, no local employer sponsor, and residence/permanent-residence oriented?" If yes, set `valid_for_selection="partial"` rather than `false`.
- Re-check `child_citizenship.birthright_citizenship.value`: if the country has broad birthright citizenship, including Canada, United States, Mexico, most of Central/South America, and other unrestricted jus soli jurisdictions, do not return `not found` or `not researched`. If the rule is conditional, state the condition.
- Use `rejected_routes` for attractive but non-fitting options, including visitor remote-work permission, closed/legacy programs, temporary-only digital nomad visas, passive-income-only routes, investor routes, and employer-sponsored routes.
- Use `best_routes` for an independent skilled/points/degree route when it is the reason for `valid_for_selection="partial"`. Keep `fully_matched=false` and make `regular_foreign_contract_remote_work_fit.value=false`.
- Do not keep empty fields as `No data`; use `Not found` or `not_confirmed_in_dataset` consistently with notes and source IDs.

Response requirements:
- Return only valid JSON matching the given schema.
- All USD amounts should be approximately converted as of the research date. If the exchange rate is approximate, say so in `notes`.
- If the official income threshold is published only in local currency, do not leave the field empty: include the local currency amount and `income_requirement_display`. USD may be approximate or `null` if conversion is unreliable.
- Do not invent exact numbers. If an exact number is unavailable, use `null` and explain in `notes`.
- For `best_routes[0]`, always fill `income_requirement_display.value`, even if `minimum_monthly_income_usd.value=null`.
- For all `valid_for_selection=true` countries, always fill `taxes.taxation_system`: `rate_type`, `top_personal_income_tax_rate_percent`, `tax_residency_rule`, `income_scope`, `special_regimes`, `social_security`, `progressive_tax_notes`, `tax_brackets`, `confidence`, `source_ids`, `notes`.
  - `rate_type` must be one of: `flat`, `progressive`, `none`, `territorial`, `remittance_basis`, `special_regime`, `mixed`, or `uncertain`.
  - For progressive systems, set `top_personal_income_tax_rate_percent` to the top marginal/screening rate used for dashboard filtering, not an estimated effective rate. Explain this in `progressive_tax_notes`.
  - Fill `tax_brackets` with available bracket rows. If exact brackets are not captured, use an empty array and explain what is missing in `progressive_tax_notes`; do not invent thresholds.
- For all `valid_for_selection=true` countries, always fill `taxes.digital_nomad_taxation`:
  - `route_tax_category`;
  - `top_or_screening_pit_rate_percent`;
  - `income_tax_display`;
  - `tax_residency_rule`;
  - `foreign_income_treatment`;
  - `special_digital_nomad_or_inbound_regime`;
  - `social_security_and_payroll`;
  - `fixed_payments.status`;
  - `fixed_payments.social_security_or_payroll`;
  - `fixed_payments.visa_or_state_fees`;
  - `fixed_payments.other_fixed_or_transaction_taxes`;
  - `fixed_payments.notes`;
  - `practical_scenarios.under_tax_residency_threshold`;
  - `practical_scenarios.tax_resident_remote_worker`;
  - `practical_scenarios.self_employed_or_local_registration`.
  If fixed payments are not found, do not leave them empty: use `not_confirmed_in_dataset` and explain that official verification is still needed.
- Add `source_ids` for every important claim, pointing to the `sources` array.
- Always fill `labor_market.average_citizen_salary` for every country:
  - `min_salary_usd_monthly`, `average_salary_usd_monthly`, `median_salary_usd_monthly`, `max_salary_usd_monthly`;
  - `min_salary_local_currency`, `average_salary_local_currency`, `median_salary_local_currency`, `max_salary_local_currency`;
  - `currency`, `salary_basis`, `period`, `confidence`, `source_ids`, and `notes`.
  - Use official statistics offices, labor ministries, social-security/wage agencies, ILO/OECD/World Bank, or reputable salary datasets. Prefer official statistics for average citizens over expat/job-board numbers.
  - Do not guess min/max. If not found, use `null` for numeric USD values and `Not confirmed in dataset` in local-currency text, with notes explaining what is missing.
- Always fill country-level `visa_application`:
  - `application_url`: the direct official application URL if found; otherwise an official route/visa information URL; use `null` only if no official/current application or visa authority page was found.
  - `application_url_type`: one of `direct_application`, `official_route_info`, `official_general_visa_portal`, `official_immigration_home`, or `not_found`.
  - `title`, `source_ids`, `last_checked`, and `notes`.
  - Prefer immigration authority, consulate, eVisa, e-government, or official route pages. Do not use blogs, news, Wikipedia, generic Google searches, or tax pages as the application URL except as notes explaining that the official application page was not found.
  - If the country is not eligible, still provide the official visa/immigration page where a person would check or apply for visas when available.
- Prefer concise output, but do not omit criteria, amounts, and timelines.
