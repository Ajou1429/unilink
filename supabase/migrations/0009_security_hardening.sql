-- Old in-flight OAuth requests have no challenge and cannot complete after this migration.
alter table public.oauth_states add column if not exists code_challenge text;

-- RLS controls rows, not columns. Keep encrypted credentials server-only.
revoke all on public.drive_connections from public, anon, authenticated;
grant all on public.drive_connections to service_role;
revoke all on public.oauth_states from public, anon, authenticated;
grant all on public.oauth_states to service_role;
grant select (user_id, folder_id, folder_ids, folder_names, account_email,
  account_name, account_photo_url, channel_id, channel_expiration)
  on public.drive_connections to authenticated;

-- Prevent attaching a problem to another user's subject, including through REST.
create unique index if not exists problem_bank_subjects_id_user_unique
  on public.problem_bank_subjects (id, user_id);
alter table public.problem_bank_problems
  add constraint problem_bank_problems_subject_owner_fk
  foreign key (subject_id, user_id)
  references public.problem_bank_subjects (id, user_id) on delete cascade not valid;
-- NOT VALID preserves pre-existing data; new inserts/updates are still checked.
-- Audit and repair old mismatches before validating the constraint (see security-hardening.md).
alter policy problem_bank_problems_insert_own on public.problem_bank_problems
  with check (auth.uid() = user_id and exists (
    select 1 from public.problem_bank_subjects s
    where s.id = subject_id and s.user_id = auth.uid()
  ));
alter policy problem_bank_problems_update_own on public.problem_bank_problems
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and exists (
    select 1 from public.problem_bank_subjects s
    where s.id = subject_id and s.user_id = auth.uid()
  ));

-- Durable reservations: service-only, serialized across Edge Function instances.
create table public.problem_bank_upload_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '5 minutes',
  finished boolean not null default false
);
alter table public.problem_bank_upload_jobs enable row level security;
revoke all on public.problem_bank_upload_jobs from anon, authenticated;
grant all on public.problem_bank_upload_jobs to service_role;
create index on public.problem_bank_upload_jobs (created_at);
create index on public.problem_bank_upload_jobs (user_id, created_at);

create function public.reserve_problem_bank_upload(p_user_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare job_id uuid;
begin
  perform pg_advisory_xact_lock(746281903);
  -- Requests that fail parsing/API calls also consume the budget.
  if (select count(*) from public.problem_bank_upload_jobs
      where created_at >= now() - interval '24 hours') >= 100
    or (select count(*) from public.problem_bank_upload_jobs
      where user_id = p_user_id and created_at >= now() - interval '24 hours') >= 5
    or (select count(*) from public.problem_bank_upload_jobs
      where not finished and expires_at > now()) >= 10
    or exists (select 1 from public.problem_bank_upload_jobs
      where user_id = p_user_id and not finished and expires_at > now()) then
    return null;
  end if;
  delete from public.problem_bank_upload_jobs where created_at < now() - interval '7 days';
  insert into public.problem_bank_upload_jobs (user_id) values (p_user_id) returning id into job_id;
  return job_id;
end;
$$;
revoke all on function public.reserve_problem_bank_upload(uuid) from public, anon, authenticated;
grant execute on function public.reserve_problem_bank_upload(uuid) to service_role;

-- Bound manual uploads at the storage API too (UI checks alone are bypassable).
update storage.buckets set file_size_limit = 20971520,
  allowed_mime_types = array['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'text/plain']
where id = 'note-files';
