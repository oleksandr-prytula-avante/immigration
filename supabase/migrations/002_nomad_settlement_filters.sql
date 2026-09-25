begin;

alter table public.countries
  add column if not exists nomad_citizenship_status text,
  add column if not exists nomad_pr_status text,
  add column if not exists nomad_citizenship_years numeric;

alter table public.countries
  drop constraint if exists countries_nomad_citizenship_status_check,
  drop constraint if exists countries_nomad_pr_status_check,
  drop constraint if exists countries_nomad_citizenship_years_check;

alter table public.countries
  add constraint countries_nomad_citizenship_status_check check (
    nomad_citizenship_status in ('confirmed', 'conditional', 'unconfirmed', 'not_available', 'not_applicable', 'research_error')
  ),
  add constraint countries_nomad_pr_status_check check (
    nomad_pr_status in ('confirmed', 'conditional', 'unconfirmed', 'not_available', 'not_applicable', 'research_error')
  ),
  add constraint countries_nomad_citizenship_years_check check (nomad_citizenship_years >= 0);

comment on column public.countries.nomad_citizenship_status is
  'Canonical reviewed nomad-to-citizenship chain, including compatible separately applied successor residence. Null means this projection has not yet been imported.';
comment on column public.countries.nomad_pr_status is
  'Canonical reviewed nomad-to-permanent-residence chain under the remote-work profile.';
comment on column public.countries.nomad_citizenship_years is
  'Citizenship eligibility years recorded in the reviewed nomad chain, separate from the general country timeline; null means unknown or inapplicable.';

create index if not exists countries_nomad_settlement_filters_idx
  on public.countries (nomad_citizenship_status, nomad_pr_status, nomad_citizenship_years);

-- Keep all existing view columns in order, appending canonical settlement fields.
create or replace view public.country_dashboard
with (security_invoker = true)
as
select
  c.id,
  c.name as country,
  c.status,
  c.researched_at,
  c.valid_for_selection,
  c.fully_matched,
  c.dnv_available,
  c.jus_soli,
  c.citizenship_track_strength,
  c.settlement_classification,
  c.regular_remote_work_fit,
  c.minimum_income_usd_monthly,
  c.top_tax_rate_percent,
  c.years_to_citizenship,
  c.passport_rank,
  c.visa_free_destinations,
  c.average_salary_usd_monthly,
  c.confidence,
  c.source_count,
  c.unresolved_field_count,
  c.selection_summary,
  c.data,
  c.updated_at,
  c.nomad_citizenship_status,
  c.nomad_pr_status,
  c.nomad_citizenship_years
from public.countries c;

grant select on public.country_dashboard to anon, authenticated;

commit;
