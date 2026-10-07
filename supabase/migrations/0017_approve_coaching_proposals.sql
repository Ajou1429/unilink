begin;

alter table public.study_plans
  add column coaching_run_id uuid;

alter table public.study_plans
  add constraint study_plans_coaching_run_owner_fk
  foreign key (coaching_run_id,user_id)
  references public.coaching_runs(id,user_id)
  deferrable initially immediate;

create unique index study_plans_coaching_run_unique
  on public.study_plans(user_id,coaching_run_id)
  where coaching_run_id is not null;

create or replace function public.approve_coaching_proposal(p_run_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_run public.coaching_runs%rowtype;
  v_plan_id uuid;
  v_item record;
  v_timezone text;
  v_start timestamptz;
  v_period_start date;
  v_period_end date;
  v_horizon text;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_run
  from public.coaching_runs
  where id = p_run_id and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Coaching proposal not found' using errcode = 'P0002';
  end if;

  if v_run.status = 'approved' then
    select id into v_plan_id from public.study_plans
    where user_id = v_user_id and coaching_run_id = p_run_id;
    if v_plan_id is null then
      raise exception 'Approved proposal has no plan' using errcode = '23514';
    end if;
    return v_plan_id;
  end if;

  if v_run.status <> 'proposed' or v_run.output_payload #>> '{schema_version}' <> '2' then
    raise exception 'Coaching proposal cannot be approved' using errcode = '23514';
  end if;

  v_period_start := (v_run.request_payload #>> '{request,period_start}')::date;
  v_period_end := (v_run.request_payload #>> '{request,period_end}')::date;
  v_timezone := coalesce(v_run.context_snapshot #>> '{context,timezone}', 'Asia/Seoul');
  if not exists (select 1 from pg_timezone_names where name = v_timezone) then
    raise exception 'Invalid coaching timezone' using errcode = '22023';
  end if;
  v_horizon := case v_run.intent
    when 'daily_plan' then 'daily'
    when 'weekly_plan' then 'weekly'
    when 'exam_prep' then 'exam_period'
    else 'custom'
  end;

  insert into public.study_plans (
    user_id, source_type, plan_horizon, period_start, period_end, status,
    idempotency_key, request_metadata, approved_at, coaching_run_id
  ) values (
    v_user_id, 'ai', v_horizon, v_period_start, v_period_end, 'active',
    'coaching:' || p_run_id::text,
    jsonb_build_object(
      'schema_version', 1,
      'coaching_run_id', p_run_id,
      'summary', v_run.output_payload #>> '{proposal,summary}',
      'deferred_goals', coalesce(v_run.output_payload #> '{proposal,deferred_goals}', '[]'::jsonb)
    ),
    now(), p_run_id
  ) returning id into v_plan_id;

  for v_item in
    select value as payload, ordinality as priority
    from jsonb_array_elements(v_run.output_payload #> '{proposal,items}') with ordinality
  loop
    v_start := (((v_item.payload->>'planned_date') || ' ' ||
      (v_item.payload->>'start_time'))::timestamp at time zone v_timezone);
    insert into public.study_plan_items (
      user_id, plan_id, goal_id, topic_id, method_code, title,
      planned_minutes, scheduled_start, scheduled_end, priority_rank,
      reason, completion_criteria, status, metadata
    ) values (
      v_user_id, v_plan_id, (v_item.payload->>'goal_id')::uuid,
      nullif(v_item.payload->>'topic_id','')::uuid, v_item.payload->>'method_code',
      v_item.payload->>'title', (v_item.payload->>'planned_minutes')::smallint,
      v_start, v_start + make_interval(mins => (v_item.payload->>'planned_minutes')::integer),
      v_item.priority::integer, nullif(v_item.payload->>'reason',''),
      '{"schema_version":1}'::jsonb, 'planned',
      jsonb_build_object('schema_version', 1, 'coaching_run_id', p_run_id)
    );
  end loop;

  if not exists (select 1 from public.study_plan_items where plan_id = v_plan_id and user_id = v_user_id) then
    raise exception 'Coaching proposal has no plan items' using errcode = '23514';
  end if;

  insert into public.coaching_feedback (
    user_id, run_id, plan_id, feedback_type, event_key
  ) values (
    v_user_id, p_run_id, v_plan_id, 'accepted', 'approve:' || p_run_id::text
  );

  update public.coaching_runs set status = 'approved'
  where id = p_run_id and user_id = v_user_id and status = 'proposed';
  if not found then
    raise exception 'Coaching proposal changed while approving' using errcode = '40001';
  end if;

  return v_plan_id;
end;
$$;

revoke all on function public.approve_coaching_proposal(uuid) from public, anon;
grant execute on function public.approve_coaching_proposal(uuid) to authenticated;

comment on column public.study_plans.coaching_run_id is
  'Source coaching proposal. One accepted proposal creates at most one plan for the same owner.';
comment on function public.approve_coaching_proposal(uuid) is
  'Atomically accepts an owned proposal, creates its plan and items, records feedback, and returns the plan id. Safe to retry.';

commit;
