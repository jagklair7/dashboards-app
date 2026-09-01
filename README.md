# Klair Dashboards

Standalone BI dashboard product — the "Custom Dashboards" offering advertised
on klair.ca. Own repo, own Supabase project, own Vercel deploy. Does **not**
share a database with the invoicing app or the hotel TV portal; it pulls from
them through small read-only API endpoints instead (see below).

## Stack

React + Vite + Supabase + Vercel — matching everything else in your product
line. Recharts for charts, Papaparse for CSV import.

## Getting started

```bash
npm install
cp .env.example .env   # fill in your Supabase project URL/anon key
npm run dev
```

Then in Supabase: create a new project (separate from the invoicing app's),
and run `supabase/schema.sql` in the SQL editor to set up tables + RLS.

## Architecture

```
Widgets  →  read only from  →  synced_data (this app's own table)
                                     ↑
                              written by connectors
                                     ↑
        ┌────────────────┬──────────┴──────────┬─────────────────┐
   Invoicing API     Hotel TV API          CSV Upload      (future: any
   connector         connector             (client-side,    other source)
                                            no remote call)
```

Widgets never call an external API directly — they only ever read
`synced_data`. That's the whole point of the connector layer: adding a new
data source later (a client's own database, a new SaaS integration, a
manual entry form) means writing one new connector module, not touching any
widget or chart code.

## Connector API contract

For the **Invoicing** and **Hotel TV** connectors to work, each of those
apps needs one new read-only serverless endpoint. Suggested shape (adjust to
match your actual auth pattern — a shared API key per org is the simplest
starting point):

```
GET /api/dashboard-metrics?org_id={orgId}
Authorization: Bearer {apiKey}   (optional for v1, recommended before real client data flows through it)

Response 200:
{
  "invoices": [
    { "date": "2026-08-01", "total": 1200.00, "status": "paid" },
    ...
  ]
}
```

(Hotel TV would return something analogous — `ad_views`, `qr_scans`, etc.
— whatever's meaningful to report on. The two connector files in
`src/lib/connectors/` already show the expected shape and are the single
place to update once the real endpoint exists.)

**Keep this endpoint read-only and rate-limited.** It's the one new surface
area each app is exposing to another app — worth being deliberate about
what it returns and who can call it, rather than reusing an existing
internal API route as-is.

## Adding a widget (until the builder UI exists)

For now, widgets are added directly via Supabase's table editor (or a SQL
insert) rather than through UI, so you can start using this before investing
in a drag-and-drop builder:

```sql
insert into widgets (dashboard_id, org_id, type, title, metric_key, size, position)
values ('{dashboard_id}', '{org_id}', 'kpi', 'Total Invoiced', 'invoice_total', 'sm', 0);
```

`type` is one of `kpi`, `line_chart`, `bar_chart`, `table`. `metric_key` has
to match whatever a connector wrote into `synced_data.metric_key` for that
org (e.g. `invoice_total`, `ad_views`).

## What's scaffolded vs. what's next

**Done:**
- Multi-tenant org structure + RLS, matching the invoicing app's pattern
- Auth (email/password), org switcher, onboarding flow
- Dashboards + widgets data model
- Three working widget types (KPI, chart, table) reading from one unified table
- Three connectors: Invoicing, Hotel TV, CSV upload
- Data Sources page — connect a source, trigger a sync or upload a CSV

**Not built yet (v1 is "you configure it," per the plan):**
- Drag-and-drop widget builder — v1 widgets are added via SQL/table editor
- Scheduled auto-sync (currently manual "Sync now" button) — wire up a
  Vercel cron hitting a serverless function that loops data_sources and
  calls `syncDataSource()`
- The actual `/api/dashboard-metrics` endpoints in the invoicing app and
  hotel TV portal — connectors are written and waiting for them
- Dashboard sharing/export (PDF export, public read-only links)
- Role-based access within an org (RLS currently treats all members equally;
  `role` column already exists on `organization_members` for when you want
  to gate write access to admins/owners)
