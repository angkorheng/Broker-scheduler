-- Needed for delta-sync bandwidth optimization: track when client rows change
alter table clients add column if not exists updated_at timestamptz default now();
