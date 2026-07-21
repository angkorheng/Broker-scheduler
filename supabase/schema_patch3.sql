-- Distinguish client meetings from internal/vendor/staff meetings
alter table appointments add column if not exists is_client_meeting boolean default true;
