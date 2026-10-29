begin;

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
    or (select count(*) from public.coaching_proposal_jobs where user_id = p_user_id and created_at >= pg_catalog.now() - interval '24 hours') >= 20
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
