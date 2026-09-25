# Dashboard and dataset consistency audit — 2026-09-25

The audit covers the static dashboard, bundled country records, route classification,
JSON uploads, Supabase import projections, local preview server, and publishing checks.
The dataset remains the research snapshot dated **2026-08-15**; this audit does not
claim to reverify current immigration or tax law across all countries.

## Verified dataset

| Check | Result |
| --- | ---: |
| Expected UN-member countries / successful records | 193 / 193 |
| Missing or duplicate countries | 0 |
| Best and rejected route records | 661 |
| Country source links | 6,039 |
| Minimum distinct source URLs per country | 15 |
| Recorded nomad / equivalent remote-work routes | 49 |
| Confirmed citizenship paths for the displayed route | 18 |
| Temporary / non-counting routes | 19 |
| Separate or profile-changing citizenship routes | 8 |
| Unconfirmed citizenship routes | 4 |
| Countries without a recorded nomad route | 144 |

All records pass the current country JSON schema, source-ID resolution, canonical
URL uniqueness, real-calendar-date validation, numeric range checks, completion
metadata checks, and evidence requirements for missing values and citizenship claims.
The original research JSON was not rewritten.

## Corrections

- Maximum income, tax and citizenship-year filters exclude unknown values. Previously,
  a one-year citizenship limit returned 30 countries with no qualifying timeline.
- Missing numeric values sort last in either direction; equal missing values allow
  deterministic secondary sorting instead of producing `NaN`.
- ALL is persisted explicitly in shareable URLs. Previously, reloading ALL reverted
  to the default YES filter. Selected country, sorting and category aliases restore
  consistently. Choosing NO NOMAD VISA clears the conflicting default YES filter.
- Uruguay's separate permanent-residence route no longer makes its nomad document a
  confirmed citizenship path. Confirmed route counts change from 19 to 18.
- Belize and UAE nomad categories no longer inherit uncertainty from another route.
  Citizenship confirmation now requires the selected route's own path explanation
  and citations resolving to recorded HTTP(S) sources.
- The table, detail status, filters and database import share the same normalization.
  Legacy nomad flags cannot contradict route availability. Database income and
  citizenship years no longer come from unrelated country routes; settlement-track
  strength uses the canonical nested field before its legacy fallback.
- Invalid uploads preserve usable data. Concurrent startup and uploads cannot
  overwrite a successfully uploaded dataset; failed uploads do not discard a
  pending default load. Failed research is UNKNOWN, never evidence of NO VISA.
- Rendered values are escaped, including tax-rate fields. Source/application links
  accept only credential-free HTTP(S) URLs.
- Annotated official-language names share filter keys (for example Spanish and
  Spanish with a regional qualification); the original labels remain in the data.
- Sort controls and country selection work with a keyboard and expose sorting and
  selection state. Narrow screens scroll the comparison table without page overflow.
- Labels distinguish country tax screening rates, route-specific citizenship, general
  country timelines, unconditional jus soli and whole-dataset summary metrics.
- The importer preserves sourced null values and rejects accidental type coercion.
  `--allow-partial` works while retaining membership, schema and evidence validation.
- The local server blocks sibling-prefix traversal and symlink escapes, handles paths
  containing spaces, and returns appropriate 400/404/405 responses.
- GitHub Pages runs the test suite, full dataset validation and import dry run before
  publishing. README instructions now match the server and actual filters.

## Verification

`npm run check` runs 46 regression tests, full validation of 193 records, and a
Supabase import dry run including SQL parameter checks. UI tests render every country
card and cover URL restoration, filters, sorting, invalid JSON, HTML injection,
unsafe links, failed research and concurrent loads. Import tests compare dashboard
projection values with all 193 stored country projections.

Manual Chrome checks cover default loading, the one-year filter, ALL across reloads,
descending income sorting, Uruguay's table/details, and a 375px viewport. At 375px,
the page stays 375px wide and the 760px table scrolls inside its container. Browser
warning/error logs were empty during the checks. The npm dependency install reported
zero known vulnerabilities.

## Scope limits

- External source pages were not revisited as part of this software/data-consistency
  audit. Citation validity here means syntactically valid URLs and resolved IDs,
  not a guarantee that a page remains live or supports a legal claim today.
- Availability is still inferred from the existing route taxonomy and country
  settlement classification; there is no separate explicit route-availability field.
  The UI therefore labels its scope as nomad / equivalent remote-work routes.
- The live Supabase database was not queried or changed. Import behavior is verified
  locally; existing stored rows require a later `npm run db:import` to receive the
  corrected projections.
