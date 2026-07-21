-- Small follow-up patch — run this after schema_overhaul.sql
alter table clients add column if not exists contact_source text;
