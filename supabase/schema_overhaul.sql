-- Cinergy Scheduler 2.0 — Fresh Schema
-- Run this in the Supabase SQL Editor (Project → SQL Editor → New query)
-- This is a clean install for the new "Cinergy Scheduler 2.0" project — no existing data to preserve.

-- BROKERS
create table brokers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order int default 0
);

insert into brokers (name, sort_order) values
  ('Cindy', 1), ('Leticia', 2), ('Kobe', 3), ('Kenzie', 4);

-- CLIENTS
create table clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  imported_from text,             -- 'Redtail' / 'CSV' / 'Manual'
  redtail_id text,                 -- external Redtail contact id, for sync matching
  assigned_broker text,            -- primary broker
  manual_brokers text[] default '{}',
  date_last_acct_summary date,     -- "Date of Last Acct. Summary" from the report
  rmd_70_half boolean default false,
  available_dpps numeric,          -- $ available for DPP investments
  available_ifs numeric,           -- $ available for IF investments
  available_notes text,            -- notes tied to DPP/IF availability
  created_at timestamptz default now()
);

create index idx_clients_name on clients (lower(name));
create index idx_clients_redtail_id on clients (redtail_id);

-- APPOINTMENTS
create table appointments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete set null,
  client_name text not null,       -- denormalized for quick display / unmatched clients
  broker text not null,
  date date not null,
  start_hour numeric not null,     -- e.g. 9.5 = 9:30am
  duration numeric not null,       -- in hours
  location text,                   -- PH / ZOOM / OFC / House / etc.
  confirmed boolean default false,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'completed', 'cancelled', 'rescheduled')),
  cancel_reason text,
  subject text,                    -- second line under client name (e.g. "Oil and Gas")
  notes text,
  from_redtail boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_appts_date on appointments (date);
create index idx_appts_client on appointments (client_id);
create index idx_appts_status on appointments (status);

-- MEETING NOTES (tied to a specific appointment/meeting, not just a client)
create table meeting_notes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  appointment_id uuid references appointments(id) on delete set null,
  broker text,
  meeting_date date,
  notes text,
  follow_up_action text,
  next_steps text,
  created_at timestamptz default now()
);

create index idx_meeting_notes_client on meeting_notes (client_id);

-- SETTINGS (overdue threshold, etc.)
create table settings (
  key text primary key,
  value text
);

insert into settings (key, value) values ('overdue_threshold_days', '90');

-- Enable Row Level Security (required for the new publishable-key model)
alter table brokers enable row level security;
alter table clients enable row level security;
alter table appointments enable row level security;
alter table meeting_notes enable row level security;
alter table settings enable row level security;

-- Simple open policies for now (single-office internal tool, no public signups).
-- Everyone using the app connects with the publishable key and needs full read/write.
create policy "allow all - brokers" on brokers for all using (true) with check (true);
create policy "allow all - clients" on clients for all using (true) with check (true);
create policy "allow all - appointments" on appointments for all using (true) with check (true);
create policy "allow all - meeting_notes" on meeting_notes for all using (true) with check (true);
create policy "allow all - settings" on settings for all using (true) with check (true);

-- Enable Realtime so the schedule grid live-updates across everyone's screen
alter publication supabase_realtime add table appointments;
alter publication supabase_realtime add table clients;
alter publication supabase_realtime add table meeting_notes;
