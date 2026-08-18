alter table public.drive_connections
  add column if not exists folder_ids text[] not null default '{}',
  add column if not exists folder_names text[] not null default '{}';

update public.drive_connections
set folder_ids = array[folder_id]
where folder_id is not null
  and coalesce(array_length(folder_ids, 1), 0) = 0;

create index if not exists drive_connections_folder_ids_idx
  on public.drive_connections using gin (folder_ids);
