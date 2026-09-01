-- Klair Dashboards — initial schema
-- Mirrors the org/RLS pattern used in invoice.digital1now.com so it's
-- familiar to maintain, but this is its OWN Supabase project — do not
-- point this at the invoicing app's project.

-- ── Organizations & membership (same shape as the invoicing app) ──────────
create table organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamp without time zone default now()
);

create table organization_members (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null default 'member', -- 'owner' | 'admin' | 'member'
  created_at  timestamp without time zone default now(),
  unique (org_id, user_id)
);

-- ── Data sources (connectors) ──────────────────────────────────────────────
-- One row per connected source per org. `type` determines which connector
-- module in src/lib/connectors handles it. `config` holds connector-specific
-- settings (e.g. which org_id to request from the invoicing app's API).
create table data_sources (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  type          text not null,              -- 'invoicing' | 'hotel_tv' | 'csv_upload' | 'manual'
  label         text not null,              -- display name, e.g. "Klair Invoicing"
  config        jsonb not null default '{}',
  status        text not null default 'active', -- 'active' | 'error' | 'disabled'
  last_synced_at timestamp without time zone,
  created_at    timestamp without time zone default now()
);

-- ── Cached synced data ──────────────────────────────────────────────────────
-- Connectors write normalized rows here on each sync, rather than the
-- dashboard querying the source app's DB directly. Keeps failure domains
-- isolated (an invoicing outage doesn't break dashboards) and lets widgets
-- query one consistent shape regardless of source.
create table synced_data (
  id            uuid primary key default gen_random_uuid(),
  data_source_id uuid not null references data_sources(id) on delete cascade,
  org_id        uuid not null references organizations(id) on delete cascade,
  metric_key    text not null,   -- e.g. 'invoice_total', 'occupancy_rate'
  dimension     text,            -- optional grouping, e.g. a date bucket or category
  value         numeric,
  recorded_at   timestamp without time zone not null,
  raw           jsonb,           -- original payload, for widgets that need more than one number
  synced_at     timestamp without time zone default now()
);
create index idx_synced_data_lookup on synced_data (org_id, metric_key, recorded_at);

-- ── Dashboards & widgets ────────────────────────────────────────────────────
create table dashboards (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  name        text not null,
  slug        text not null,       -- used in the URL, unique per org
  is_default  boolean not null default false,
  created_at  timestamp without time zone default now(),
  unique (org_id, slug)
);

create table widgets (
  id            uuid primary key default gen_random_uuid(),
  dashboard_id  uuid not null references dashboards(id) on delete cascade,
  org_id        uuid not null references organizations(id) on delete cascade,
  type          text not null,      -- 'kpi' | 'line_chart' | 'bar_chart' | 'table'
  title         text not null,
  data_source_id uuid references data_sources(id) on delete set null,
  metric_key    text,               -- which metric_key in synced_data this widget reads
  config        jsonb not null default '{}', -- chart-specific options (colors, date range, etc.)
  position      integer not null default 0,  -- render order on the dashboard
  size          text not null default 'md',  -- 'sm' | 'md' | 'lg' | 'full' — grid width hint
  created_at    timestamp without time zone default now()
);

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table organizations enable row level security;
alter table organization_members enable row level security;
alter table data_sources enable row level security;
alter table synced_data enable row level security;
alter table dashboards enable row level security;
alter table widgets enable row level security;

-- Helper: returns the current user's org_ids. SECURITY DEFINER means this
-- runs with the privileges of the function owner (who bypasses their own
-- table's RLS by default), which breaks the infinite-recursion trap you get
-- if organization_members' own policy queries organization_members directly
-- inside its USING clause. Every other table's policy also routes through
-- this instead of repeating the subquery, both for consistency and because
-- Postgres only has to evaluate it once (stable) rather than per row.
create or replace function get_user_org_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select org_id from organization_members where user_id = auth.uid()
$$;

-- organizations: members can read their own org
create policy "members can select their own org"
on organizations for select
using (id in (select get_user_org_ids()));

-- organizations: any authenticated user can create a new org (onboarding flow)
create policy "authenticated users can create organizations"
on organizations for insert
with check (auth.uid() is not null);

-- organization_members: members can see membership rows for their own org
create policy "members can select org membership"
on organization_members for select
using (org_id in (select get_user_org_ids()));

-- organization_members: a user can only ever insert a membership row for
-- THEMSELVES (not add other users) — covers the onboarding flow where a
-- new org's creator adds themselves as 'owner'. Inviting teammates will
-- need its own policy/flow later (e.g. an invite-token table checked here).
create policy "users can insert their own membership"
on organization_members for insert
with check (user_id = auth.uid());

-- ── Org creation RPC ─────────────────────────────────────────────────────
-- Creating an org via two separate client-side inserts (organizations, then
-- organization_members) hits a chicken-and-egg RLS problem: Supabase's
-- .insert().select() re-selects the new row, which Postgres checks against
-- the SELECT policy — but organizations' SELECT policy requires already
-- being a member, and that membership row doesn't exist until the very next
-- insert. Doing both inserts atomically inside one SECURITY DEFINER
-- function sidesteps this entirely (and avoids leaving an orphaned org
-- behind if the membership insert ever failed on its own).
create or replace function create_organization(org_name text)
returns organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org organizations;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated to create an organization';
  end if;

  insert into organizations (name) values (org_name) returning * into new_org;

  insert into organization_members (org_id, user_id, role)
  values (new_org.id, auth.uid(), 'owner');

  return new_org;
end;
$$;

grant execute on function create_organization(text) to authenticated;

-- Generic per-table org-scoped policy pattern, repeated for each table below.
-- (Split into select/insert/update/delete so you can tighten write access
-- by role later without touching read access.)

create policy "org members can select data_sources" on data_sources for select
  using (org_id in (select get_user_org_ids()));
create policy "org members can insert data_sources" on data_sources for insert
  with check (org_id in (select get_user_org_ids()));
create policy "org members can update data_sources" on data_sources for update
  using (org_id in (select get_user_org_ids()));
create policy "org members can delete data_sources" on data_sources for delete
  using (org_id in (select get_user_org_ids()));

create policy "org members can select synced_data" on synced_data for select
  using (org_id in (select get_user_org_ids()));
create policy "org members can insert synced_data" on synced_data for insert
  with check (org_id in (select get_user_org_ids()));
create policy "org members can delete synced_data" on synced_data for delete
  using (org_id in (select get_user_org_ids()));

create policy "org members can select dashboards" on dashboards for select
  using (org_id in (select get_user_org_ids()));
create policy "org members can insert dashboards" on dashboards for insert
  with check (org_id in (select get_user_org_ids()));
create policy "org members can update dashboards" on dashboards for update
  using (org_id in (select get_user_org_ids()));
create policy "org members can delete dashboards" on dashboards for delete
  using (org_id in (select get_user_org_ids()));

create policy "org members can select widgets" on widgets for select
  using (org_id in (select get_user_org_ids()));
create policy "org members can insert widgets" on widgets for insert
  with check (org_id in (select get_user_org_ids()));
create policy "org members can update widgets" on widgets for update
  using (org_id in (select get_user_org_ids()));
create policy "org members can delete widgets" on widgets for delete
  using (org_id in (select get_user_org_ids()));
