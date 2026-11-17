-- Source-bound comparison features. Original notes and learning evidence stay intact.
begin;
create table public.note_content_profiles (
  note_id uuid primary key references public.notes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_version integer not null,
  source_updated_at timestamptz not null,
  profile jsonb not null check (octet_length(profile::text) <= 65536),
  created_at timestamptz not null default now()
);
create index note_content_profiles_user_idx on public.note_content_profiles(user_id);
alter table public.note_content_profiles enable row level security;
revoke all on public.note_content_profiles from public, anon, authenticated;
grant select on public.note_content_profiles to authenticated;
grant all on public.note_content_profiles to service_role;
create policy own_profiles on public.note_content_profiles for select to authenticated using (user_id = auth.uid());

create function public.save_note_content_profile(p_note uuid, p_version integer, p_updated_at timestamptz, p_profile jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare n public.notes; principal uuid := auth.uid();
begin
  if principal is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into n from public.notes where id = p_note and user_id = principal for share;
  if not found then raise exception 'Note not found' using errcode = '42501'; end if;
  if p_version is null or p_updated_at is null or n.version <> p_version or n.updated_at <> p_updated_at then
    raise exception 'Note changed. Analyze the current source again.' using errcode = '40001';
  end if;
  if p_profile is null or jsonb_typeof(p_profile) <> 'object' or octet_length(p_profile::text) > 65536
     or p_profile->>'version' is distinct from '1'
     or coalesce(p_profile->>'fileHash', '') !~ '^[a-f0-9]{64}$'
     or jsonb_typeof(p_profile->'samples') is distinct from 'array'
     or jsonb_typeof(p_profile->'complete') is distinct from 'boolean'
     or coalesce(p_profile->>'characters', '') !~ '^[0-9]{1,7}$'
     or coalesce(p_profile->>'unique', '') !~ '^[0-9]{1,7}$' then
    raise exception 'Invalid content profile' using errcode = '22023';
  end if;
  if jsonb_array_length(p_profile->'samples') > 1024 then raise exception 'Too many features' using errcode = '22023'; end if;
  insert into public.note_content_profiles(note_id,user_id,source_version,source_updated_at,profile)
    values(p_note,principal,p_version,p_updated_at,p_profile)
    on conflict(note_id) do update set source_version=excluded.source_version,source_updated_at=excluded.source_updated_at,profile=excluded.profile;
exception when serialization_failure then
  if nullif(current_setting('request.method',true),'') is not null then
    raise sqlstate 'PGRST' using
      message=jsonb_build_object('code','40001','message',sqlerrm,'details',null,'hint',null)::text,
      detail='{"status":409,"headers":{}}';
  end if;
  raise;
end;
$$;
revoke all on function public.save_note_content_profile(uuid,integer,timestamptz,jsonb) from public,anon;
grant execute on function public.save_note_content_profile(uuid,integer,timestamptz,jsonb) to authenticated;
commit;
