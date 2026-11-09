begin;

-- Only execution identifiers survive. Raw one-off requests are never profile facts.
create function public.scoped_coaching_request(p jsonb) returns jsonb
language sql immutable set search_path='' as $$
  select jsonb_build_object('schema_version',1,'request_hash',p->'request_hash',
    'text_storage_policy','single_generation_not_persisted',
    'one_off_text_present',coalesce(p->>'one_off_text_present','false')='true'
      or length(coalesce(p#>>'{request,desired_outcome}',''))>0 or length(coalesce(p#>>'{request,constraints}',''))>0,
    'request',jsonb_build_object('goal_ids',p#>'{request,goal_ids}','intent',p#>'{request,intent}',
      'period_start',p#>'{request,period_start}','period_end',p#>'{request,period_end}'));
$$;
create function public.enforce_scoped_coaching_request() returns trigger
language plpgsql set search_path='' as $$
begin
  new.request_payload:=public.scoped_coaching_request(new.request_payload);
  return new;
end; $$;
create trigger coaching_request_scope before insert or update of request_payload on public.coaching_runs
  for each row execute function public.enforce_scoped_coaching_request();
-- Deliberately remove historical raw request fields without deleting plans or idempotency hashes.
update public.coaching_runs set request_payload=public.scoped_coaching_request(request_payload);

create table public.coaching_satisfaction (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  run_id uuid not null,
  rating smallint not null check(rating between 1 and 5),
  difficulty_fit text check(difficulty_fit in ('too_easy','appropriate','too_hard')),
  time_fit text check(time_fit in ('too_short','appropriate','too_long')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(run_id,user_id),
  foreign key(run_id,user_id) references public.coaching_runs(id,user_id) on delete cascade
);
alter table public.coaching_satisfaction enable row level security;
revoke all on public.coaching_satisfaction from public,anon,authenticated;
grant select on public.coaching_satisfaction to authenticated;
grant all on public.coaching_satisfaction to service_role;
create policy own_coaching_satisfaction on public.coaching_satisfaction for select to authenticated using(user_id=(select auth.uid()));
create trigger coaching_satisfaction_updated before update on public.coaching_satisfaction
  for each row execute function public.set_updated_at();

create function public.record_coaching_satisfaction(p_run uuid,p_rating integer,p_difficulty text default null,p_time text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); result uuid;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_rating is null or p_rating not between 1 and 5
    or (p_difficulty is not null and p_difficulty not in ('too_easy','appropriate','too_hard'))
    or (p_time is not null and p_time not in ('too_short','appropriate','too_long')) then
    raise exception 'Invalid satisfaction values' using errcode='22023';
  end if;
  if not exists(select 1 from public.coaching_runs where id=p_run and user_id=uid and status in ('proposed','approved')) then
    raise exception 'Available proposal not found' using errcode='42501';
  end if;
  insert into public.coaching_satisfaction(user_id,run_id,rating,difficulty_fit,time_fit)
  values(uid,p_run,p_rating,p_difficulty,p_time)
  on conflict(run_id,user_id) do update set rating=excluded.rating,difficulty_fit=excluded.difficulty_fit,time_fit=excluded.time_fit
  where (coaching_satisfaction.rating,coaching_satisfaction.difficulty_fit,coaching_satisfaction.time_fit)
    is distinct from (excluded.rating,excluded.difficulty_fit,excluded.time_fit)
  returning id into result;
  if result is null then select id into result from public.coaching_satisfaction where user_id=uid and run_id=p_run; end if;
  return result;
end; $$;
revoke all on function public.record_coaching_satisfaction(uuid,integer,text,text) from public,anon;
grant execute on function public.record_coaching_satisfaction(uuid,integer,text,text) to authenticated;

create function public.clear_coaching_satisfaction(p_run uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  delete from public.coaching_satisfaction where run_id=p_run and user_id=auth.uid();
end; $$;
revoke all on function public.clear_coaching_satisfaction(uuid) from public,anon;
grant execute on function public.clear_coaching_satisfaction(uuid) to authenticated;

create view public.coaching_satisfaction_evidence with(security_invoker=true) as
  select s.id,s.user_id,s.run_id,g.id as goal_id,s.rating,s.difficulty_fit,s.time_fit,s.updated_at as observed_at,
    (r.request_payload->>'one_off_text_present'='true') as had_one_off_request,
    'whole_proposal_not_topic_mastery'::text as scope
  from public.coaching_satisfaction s
  join public.coaching_runs r on r.id=s.run_id and r.user_id=s.user_id
  join public.learning_goals g on g.user_id=s.user_id and (r.request_payload#>'{request,goal_ids}') ? g.id::text;

-- Inspectable source observations, not an LLM-written personality/profile table.
create view public.learner_personalization_events with(security_invoker=true) as
  select s.id as event_id,s.user_id,s.goal_id,'study_result'::text as event_type,
    coalesce(s.ended_at,s.started_at,s.created_at) as observed_at,
    jsonb_build_object('plan_item_id',s.plan_item_id,'method_code',s.method_code,'actual_minutes',s.actual_minutes,
      'completion_status',s.completion_status,'self_rating_before',s.mastery_before,'self_rating_after',s.mastery_after) as details
  from public.study_sessions s
  union all
  select o.id,o.user_id,o.goal_id,'understanding',o.observed_at,
    jsonb_build_object('topic_id',o.topic_id,'learning_status',o.learning_status,'self_rating',o.self_rating)
  from public.topic_observations o
  union all
  select f.id,f.user_id,f.goal_id,'satisfaction',f.observed_at,
    jsonb_build_object('run_id',f.run_id,'rating',f.rating,'difficulty_fit',f.difficulty_fit,'time_fit',f.time_fit,
      'had_one_off_request',f.had_one_off_request,'scope',f.scope)
  from public.coaching_satisfaction_evidence f;
revoke all on public.coaching_satisfaction_evidence,public.learner_personalization_events from public,anon,authenticated;
grant select on public.coaching_satisfaction_evidence,public.learner_personalization_events to authenticated,service_role;
comment on view public.learner_personalization_events is
  'Owner-scoped observable outcomes and understanding; excludes one-off request text, feedback prose and inferred permanent traits.';
commit;
