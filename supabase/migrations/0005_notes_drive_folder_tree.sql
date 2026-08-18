alter table public.notes
  add column if not exists drive_folder_id text,
  add column if not exists drive_folder_name text,
  add column if not exists drive_folder_path text[] not null default '{}',
  add column if not exists drive_folder_path_ids text[] not null default '{}';

create index if not exists notes_user_drive_folder_id_idx
  on public.notes (user_id, drive_folder_id)
  where drive_folder_id is not null;
