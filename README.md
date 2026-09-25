# Immigration Research Script

A ready-to-use research scaffold for checking all 193 UN member states through the OpenAI API with web search and saving structured results to JSON.

## Contents

- `countries.un-members-193.json` - list of 193 UN member states.
- `research_prompt.md` - detailed research prompt with `{{COUNTRY}}` and `{{TODAY}}` placeholders.
- `immigration_research.mjs` - script that calls the OpenAI API, requests structured JSON, and saves progress.
- `package.json` - minimal project dependencies.
- `dashboard/` - local one-page dashboard for reviewing the collected JSON.

## Run

```bash
npm install
export OPENAI_API_KEY="your_api_key"
npm run research
```

Run a single-country test:

```bash
npm run research:test-one
```

Useful options:

```bash
node immigration_research.mjs --country Portugal
node immigration_research.mjs --limit 10
node immigration_research.mjs --start Germany
node immigration_research.mjs --out data/research.json
node immigration_research.mjs --model gpt-5.6
```

The script saves results after each country, so it is safe to stop and restart.
With `--force`, each country is researched again and compared with its existing
record. Every country must have at least 10 distinct source URLs; records that
still contain unresolved markers receive a focused second pass with at least 5
additional sources and must finish with at least 15 distinct source URLs.

Full 193-country refresh:

```bash
node immigration_research.mjs --force
```

## Dashboard

The one-page dashboard is located at `dashboard/index.html`.

Start the local preview with Node.js 22.13 or newer:

```bash
npm run dashboard
```

Open the `http://127.0.0.1:<port>` URL printed by the server. The port is selected
automatically. The bundled 193-country dataset loads on startup.

Click `UPLOAD JSON` and select the result file, for example:

```text
data/immigration-research.json
```

The dashboard defaults to recorded digital-nomad or equivalent remote-work routes.
It supports country/text search, official-language filtering, citizenship categories,
unconditional jus soli, maximum income/tax/citizenship-year limits, and sortable
columns. Filters, sorting, and selected country are preserved in the URL; uploaded
files remain local to the current page and are not embedded in that URL.

Maximum filters exclude unknown values. Numeric sorting keeps unknown values last
in both directions. Summary cards describe the entire loaded dataset. TOP TAX is a
screening rate, not an effective tax estimate. Citizenship YES requires a cited path
for the displayed route; a separate residence route does not qualify that visa.
PR PATH separately shows whether a recorded nomad/remote-worker route can be followed
by permanent residence while keeping foreign remote work. A separate application or
exit is acceptable; nomad time need not count. YES requires a sourced pathway for
that profile. CONDITIONAL needs additional eligibility, UNCONFIRMED lacks sufficient
evidence, and NO means no supported PR pathway. The country details show the successor,
conditions, residence clock, exit requirement, sources and review date. The JSON field
is `digital_nomad_pr_transition`; older exports without it display UNCONFIRMED.

YEARS displays the recorded country timeline regardless of CIT status, including
general or alternative-route timelines. The details panel preserves their notes
and conditions. Missing numeric timelines remain NOT FOUND.

Run the full checks before publishing:

```bash
npm run check
```

This runs regression tests, dataset schema/consistency validation, and a database
import dry run without connecting to Supabase. GitHub Pages deployment runs these
checks too.

## Supabase database

The migration creates normalized country, route, and source tables, an immutable
snapshot history, and a read-only `country_dashboard` view. The complete country
record is also retained in `countries.data` as `jsonb`.

Copy the Postgres connection string from Supabase (`Connect` > `Session pooler`)
and save it in `.env`. Keep this value server-side and never add it to dashboard
JavaScript:

```text
SUPABASE_DB_URL=postgresql://...
```

Apply the schema and atomically import all 193 current results:

```bash
npm run db:setup
```

Run the steps separately when needed:

```bash
npm run db:migrate
npm run db:import
node scripts/import-to-supabase.mjs --file dashboard/data/all-countries.json
node scripts/import-to-supabase.mjs --validate-only
```

The importer refuses incomplete datasets by default. Use `--allow-partial` only
for an intentional partial import. Re-importing updates the current country rows
and creates a new entry in `research_runs` plus new `country_snapshots` history.
