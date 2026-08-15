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

If the local preview server is running, open:

```text
http://localhost:4174/
```

Click `Load JSON` and select the result file, for example:

```text
data/immigration-research.json
```

The dashboard supports search, default eligible filtering, fully matched filtering, income/tax/citizenship-year filters, and sorting by citizenship/passport timeline, country, and taxation.

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
