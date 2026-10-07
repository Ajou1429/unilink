begin;

create table if not exists public.coaching_proposal_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '2 minutes',
  finished boolean not null default false,
  result_code text check (result_code in ('validated','rejected','model_error')),
  item_count smallint check (item_count between 0 and 30),
  latency_ms integer check (latency_ms >= 0),
  model_name text,
  prompt_version text,
  policy_version text
);

alter table public.coaching_proposal_jobs enable row level security;
revoke all on public.coaching_proposal_jobs from public, anon, authenticated;
grant all on public.coaching_proposal_jobs to service_role;

create index if not exists coaching_proposal_jobs_user_created_idx
  on public.coaching_proposal_jobs(user_id,created_at);
create index if not exists coaching_proposal_jobs_active_idx
  on public.coaching_proposal_jobs(expires_at) where not finished;

create or replace function public.reserve_coaching_proposal(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare job_id uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(746281904);
  if (select count(*) from public.coaching_proposal_jobs where created_at >= pg_catalog.now() - interval '24 hours') >= 100
    or (select count(*) from public.coaching_proposal_jobs where user_id = p_user_id and created_at >= pg_catalog.now() - interval '24 hours') >= 5
    or (select count(*) from public.coaching_proposal_jobs where not finished and expires_at > pg_catalog.now()) >= 10
    or exists (select 1 from public.coaching_proposal_jobs where user_id = p_user_id and not finished and expires_at > pg_catalog.now()) then
    return null;
  end if;
  delete from public.coaching_proposal_jobs where created_at < pg_catalog.now() - interval '7 days';
  insert into public.coaching_proposal_jobs(user_id) values (p_user_id) returning id into job_id;
  return job_id;
end;
$$;

revoke all on function public.reserve_coaching_proposal(uuid) from public, anon, authenticated;
grant execute on function public.reserve_coaching_proposal(uuid) to service_role;

comment on table public.coaching_proposal_jobs is
  'Service-only quota and operational status; proposals and user text are not stored here.';

commit;
