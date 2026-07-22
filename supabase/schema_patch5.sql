-- Support multiple brokers per appointment (e.g. joint client meetings)
alter table appointments add column if not exists brokers text[];

-- Backfill: copy the existing single broker into the new array column
update appointments set brokers = array[broker] where brokers is null and broker is not null;
