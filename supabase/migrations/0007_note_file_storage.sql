alter table public.notes
  add column if not exists file_path text;

insert into storage.buckets (id, name, public)
values ('note-files', 'note-files', false)
on conflict (id) do update set public = false;

drop policy if exists "note_files_select_own" on storage.objects;
create policy "note_files_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'note-files'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "note_files_insert_own" on storage.objects;
create policy "note_files_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'note-files'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "note_files_delete_own" on storage.objects;
create policy "note_files_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'note-files'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
