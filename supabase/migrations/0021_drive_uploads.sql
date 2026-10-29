begin;
create table public.drive_upload_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  note_id uuid not null unique,
  drive_file_id text,
  status text not null default 'uploading' check(status in ('uploading','completed','failed')),
  expires_at timestamptz not null default now()+interval '3 minutes',
  created_at timestamptz not null default now(),
  foreign key(note_id,user_id) references public.notes(id,user_id) on delete cascade
);
alter table public.drive_upload_jobs enable row level security;
revoke all on public.drive_upload_jobs from public,anon,authenticated;
grant all on public.drive_upload_jobs to service_role;
create index drive_upload_jobs_owner on public.drive_upload_jobs(user_id,created_at);
create function public.reserve_drive_upload(p_note uuid,p_user uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text,21));
  if not exists(select 1 from public.notes where id=p_note and user_id=p_user) then raise exception 'Note unavailable'; end if;
  if exists(select 1 from public.drive_upload_jobs where user_id=p_user and status='uploading' and expires_at>now()) then raise exception 'Upload in progress'; end if;
  if (select count(*) from public.drive_upload_jobs where user_id=p_user and created_at>now()-interval '24 hours')>=30 then raise exception 'Upload quota exceeded'; end if;
  insert into public.drive_upload_jobs(user_id,note_id) values(p_user,p_note)
    on conflict(note_id) do update set status='uploading',expires_at=now()+interval '3 minutes' returning id into result;
  return result;
end; $$;
revoke all on function public.reserve_drive_upload(uuid,uuid) from public,anon,authenticated;
grant execute on function public.reserve_drive_upload(uuid,uuid) to service_role;
commit;
