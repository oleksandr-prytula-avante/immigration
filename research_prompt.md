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

What to research:
1. Whether there is an independent self-application route:
   - Digital nomad visa, remote worker visa, freelance/self-employed visa, independent visa, entrepreneur/sole proprietor route, or residence permit for independent professionals.
   - Whether this scenario is possible: enter as a visitor, open a bank account, register as a sole proprietor / freelancer / self-employed person, and then legalize residence.
   - If the country only has employer-sponsored routes, clearly set `valid_for_selection=false`.
   - If the country only allows visitor/eVisa/visa-free/standard visitor remote work, clearly set `valid_for_selection=false` even if remote work is tolerated.
2. Whether there is a separate independent route that truly fits an ordinary foreign-contract remote worker. Points-based migration, skilled migration, talent routes, founder/startup routes, and investor/golden routes may be described only as rejected or alternative routes. Do not set `valid_for_selection=true` for the current profile unless the route is an ordinary remote-worker/freelance/self-employed application.
3. For each potentially suitable route:
   - program name;
   - status type: visa, temporary residence, permanent residence, freelancer status, entrepreneur status, citizenship, or other;
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
   - whether a child gets citizenship if both parents are migrants;
   - whether a child gets citizenship if only the father is a migrant and the other parent is a local citizen or permanent resident;
   - whether birth of a citizen child gives the father advantages for residence, permanent residence, or citizenship.
8. Passport:
   - passport rank in the Henley Passport Index or another named index;
   - number of visa-free destinations;
   - number of destinations requiring a visa in advance;
   - number of visa-on-arrival / eTA destinations, if the source separates them.
   - For countries passing selection, `rank` and `visa_free_destinations` must not remain empty. If Henley does not provide the needed breakdown, use a reliable passport index and cite the source.
9. Languages:
   - official national language(s);
   - how realistic it is to live and work remotely in English, Russian, or Ukrainian, if sources support that.
10. Economy:
   - average monthly salary in USD;
   - median salary, if available;
   - brief cost-of-living note only if there is a reliable source.

Selection validity criteria:
- Set `valid_for_selection=true` only if there is at least one route where the applicant can apply independently without a local employer and that route is, or can convert into, a qualifying residence track for permanent residence/citizenship.
- A digital nomad route is valid only if it allows the applicant to live in the country with foreign contract/income and official/current sources confirm that the status can count toward, or convert into, a qualifying residence path. If it is temporary-only, visitor-like, workcation-only, or explicitly excluded from settlement, set `valid_for_selection=false`.
- A freelance/self-employed route is valid if the applicant can obtain status without a local employer and without a mandatory local client / host-country assignment / proof of substantial local economic interest that is incompatible with ordinary work for a foreign client.
- Visitor status, eVisa, visa-free stay, standard visitor remote-work permission, tourist extensions, workcation programs, and legacy/closed remote-work programs are not valid for selection. Put them in `rejected_routes` or keep them as contextual notes, but set `valid_for_selection=false`.
- Employer-sponsored skilled-worker routes are not valid for selection.
- Founder/startup, investor/golden visa, elite talent/high-achievement, points-tested/skilled migration invitation, ONE Pass/Tech.Pass-style, local employment, local-client assignment, or prospective local-employment routes are not valid for this selection unless they fit an ordinary foreign-contract remote worker without startup, investment, exceptional achievement, local work, or local customer requirements.
- Planned / announced / authorized-but-not-open programs are not valid for current selection: set `valid_for_selection=false` if there is no active official application channel or stable application rules.
- If information is contradictory or not confirmed by current official/current sources, set `valid_for_selection="uncertain"` and explain exactly what is missing. Do not use `"partial"` in final output.

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
- Set `valid_for_selection=true` only when `regular_foreign_contract_remote_work_fit.value=true`. If the value is `false` or `"needs_manual_review"`, `valid_for_selection` must be `false` or `"uncertain"`, never `true`.
- Set `fully_matched=true` only if `valid_for_selection=true`, `settlement_track.classification` is `strong_citizenship_track` or `possible_with_conversion`, `regular_foreign_contract_remote_work_fit.value=true`, and official/current sources confirm a credible residence-to-citizenship route. In all other cases, set `fully_matched=false`.
- If `settlement_track.classification="temporary_nomad_only"`, then `valid_for_selection=false`, `fully_matched=false`, and `regular_foreign_contract_remote_work_fit.value` may be true only as a temporary-living fit, with notes saying it is not a citizenship-path fit.

Final country audit before returning JSON:
- Re-read the chosen route and ask: "Is this only a visitor, visa-free, eVisa, standard visitor, tourist extension, workcation, or temporary digital-nomad stay?" If yes, set `valid_for_selection=false`.
- Ask: "Can this exact route count toward or convert into permanent residence/citizenship for an ordinary foreign-contract remote worker?" If not confirmed by official/current sources, do not mark it fully matched.
- Ask: "Does this require a local employer, local client, local assignment, investment, startup/founder role, elite-talent threshold, or points/invitation route?" If yes, set `valid_for_selection=false` unless a separate ordinary remote-worker/freelance route exists.
- Use `rejected_routes` for attractive but non-fitting options, including visitor remote-work permission, closed/legacy programs, temporary-only digital nomad visas, passive-income-only routes, investor routes, and employer-sponsored routes.
- Do not keep empty fields as `No data`; use `Not found` or `not_confirmed_in_dataset` consistently with notes and source IDs.

Response requirements:
- Return only valid JSON matching the given schema.
- All USD amounts should be approximately converted as of the research date. If the exchange rate is approximate, say so in `notes`.
- If the official income threshold is published only in local currency, do not leave the field empty: include the local currency amount and `income_requirement_display`. USD may be approximate or `null` if conversion is unreliable.
- Do not invent exact numbers. If an exact number is unavailable, use `null` and explain in `notes`.
- For `best_routes[0]`, always fill `income_requirement_display.value`, even if `minimum_monthly_income_usd.value=null`.
- For all `valid_for_selection=true` countries, always fill `taxes.taxation_system`: `rate_type`, `top_personal_income_tax_rate_percent`, `tax_residency_rule`, `income_scope`, `special_regimes`, `social_security`, `confidence`, `source_ids`, `notes`.
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
- Prefer concise output, but do not omit criteria, amounts, and timelines.
