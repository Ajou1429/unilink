-- Some projects have 0013 in schema_migrations but lack its columns.
-- Reapply the idempotent health fields required by google-auth/complete.
alter table public.drive_connections
  add column if not exists connection_status text not null default 'active',
  add column if not exists last_error_code text,
  add column if not exists last_error_at timestamptz;

alter table public.drive_connections
  drop constraint if exists drive_connections_status_check;
alter table public.drive_connections
  add constraint drive_connections_status_check
  check (connection_status in ('active', 'reconnect_required'));

grant select (connection_status, last_error_code, last_error_at)
  on public.drive_connections to authenticated;
