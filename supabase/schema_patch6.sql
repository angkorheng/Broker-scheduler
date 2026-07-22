-- Distinguish prospects/potential clients from the real client base
alter table clients add column if not exists is_prospect boolean default false;
