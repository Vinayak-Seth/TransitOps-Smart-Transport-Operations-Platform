-- TransitOps real-backend schema
-- Run this entire file in Supabase → SQL Editor → New query → Run

-- 1. Single-document store for the whole fleet dataset.
--    (Pragmatic choice for a hackathon: one JSONB blob keeps the existing
--    app logic almost unchanged while giving you a REAL, shared Postgres
--    backend instead of browser-only storage. A production version would
--    normalize this into separate vehicles/drivers/trips/... tables.)
create table if not exists fleet_data (
  id text primary key default 'main',
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

insert into fleet_data (id, payload)
values ('main', '{}'::jsonb)
on conflict (id) do nothing;

alter table fleet_data enable row level security;

-- Permissive demo policy: anyone with the anon key can read/write.
-- Fine for a hackathon demo using the public anon key; NOT fine for a real
-- production app (you'd scope this to authenticated users / RLS rules).
drop policy if exists "public read/write for demo" on fleet_data;
create policy "public read/write for demo"
  on fleet_data for all
  using (true)
  with check (true);


-- 2. Storage bucket for real vehicle document uploads (insurance, RC, etc.)
insert into storage.buckets (id, name, public)
values ('vehicle-documents', 'vehicle-documents', true)
on conflict (id) do nothing;

drop policy if exists "Public upload to vehicle-documents" on storage.objects;
create policy "Public upload to vehicle-documents"
  on storage.objects for insert
  with check (bucket_id = 'vehicle-documents');

drop policy if exists "Public read vehicle-documents" on storage.objects;
create policy "Public read vehicle-documents"
  on storage.objects for select
  using (bucket_id = 'vehicle-documents');

-- Done. After running this, copy your Project URL and anon public key
-- from Settings → API into your .env file (see SETUP_REAL_BACKEND.md).
