begin;

alter table public.topic_observations
  add column voided_at timestamptz,
  add column recorded_via text not null default 'manual' check (recorded_via in ('manual','chat')),
  add column supersedes_id uuid references public.topic_observations(id);

create view public.active_course_sessions with (security_invoker=true) as
  select * from public.course_sessions where coalesce(metadata->>'deleted','false')<>'true';
create view public.active_topic_observations with (security_invoker=true) as
  select o.* from public.topic_observations o
  join public.goal_topics t on t.id=o.topic_id and t.goal_id=o.goal_id and t.user_id=o.user_id
  where o.voided_at is null and t.status='confirmed';
revoke all on public.active_course_sessions,public.active_topic_observations from public,anon;
grant select on public.active_course_sessions,public.active_topic_observations to authenticated,service_role;

-- Preserve the original column order for dependent views and older clients.
create or replace view public.topic_learning_states with (security_invoker=true) as
  select distinct on (o.user_id,o.topic_id)
    o.id,o.user_id,o.goal_id,o.topic_id,o.session_id,o.note_id,o.learning_status,o.self_rating,
    o.memo,o.page_start,o.page_end,o.source,o.observed_at,o.created_at,o.request_id,s.session_date,o.recorded_via
  from public.active_topic_observations o
  left join public.active_course_sessions s on s.id=o.session_id and s.user_id=o.user_id
  order by o.user_id,o.topic_id,o.observed_at desc,o.created_at desc,o.id desc;

create or replace view public.learner_personalization_events with (security_invoker=true) as
  select s.id as event_id,s.user_id,s.goal_id,'study_result'::text as event_type,
    coalesce(s.ended_at,s.started_at,s.created_at) as observed_at,
    jsonb_build_object('plan_item_id',s.plan_item_id,'method_code',s.method_code,'actual_minutes',s.actual_minutes,
      'completion_status',s.completion_status,'self_rating_before',s.mastery_before,'self_rating_after',s.mastery_after) as details
  from public.study_sessions s
  union all
  select o.id,o.user_id,o.goal_id,'understanding',o.observed_at,
    jsonb_build_object('topic_id',o.topic_id,'learning_status',o.learning_status,'self_rating',o.self_rating)
  from public.active_topic_observations o
  union all
  select f.id,f.user_id,f.goal_id,'satisfaction',f.observed_at,
    jsonb_build_object('run_id',f.run_id,'rating',f.rating,'difficulty_fit',f.difficulty_fit,'time_fit',f.time_fit,
      'had_one_off_request',f.had_one_off_request,'scope',f.scope)
  from public.coaching_satisfaction_evidence f;

create function public.record_chat_topic_observation(p_goal uuid,p_topic uuid,p_title text,p_status text,
  p_rating integer,p_observed_at timestamptz,p_request uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); t public.goal_topics%rowtype; o public.topic_observations%rowtype;
  created boolean:=false; topic_count integer; result uuid;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,32));
  if p_request is null or p_title is null or length(btrim(p_title)) not between 1 and 200
    or p_status is null or p_status not in ('not_started','in_progress','needs_review','understood')
    or (p_rating is not null and p_rating not between 1 and 5) or (p_status='not_started' and p_rating is not null)
    or p_observed_at is null or p_observed_at>now()+interval '5 minutes' then
    raise exception 'Invalid chat observation' using errcode='22023';
  end if;
  if not exists(select 1 from public.learning_goals where id=p_goal and user_id=uid and status='active') then
    raise exception 'Active learning goal required' using errcode='42501';
  end if;
  select * into o from public.topic_observations where user_id=uid and request_id=p_request;
  if found then
    if o.recorded_via<>'chat' or o.goal_id<>p_goal or o.learning_status<>p_status
      or o.self_rating is distinct from p_rating or o.observed_at<>p_observed_at or o.voided_at is not null then
      raise exception 'Chat request was already used or canceled' using errcode='23514';
    end if;
    select * into t from public.goal_topics where id=o.topic_id and user_id=uid;
    if (p_topic is not null and p_topic<>t.id) or lower(regexp_replace(t.title,'\s+','','g'))<>lower(regexp_replace(btrim(p_title),'\s+','','g')) then
      raise exception 'Chat request topic changed' using errcode='23514';
    end if;
    return jsonb_build_object('observation_id',o.id,'topic_id',t.id,'title',t.title,'created',false);
  end if;
  if p_topic is not null then
    select * into t from public.goal_topics where id=p_topic and goal_id=p_goal and user_id=uid and status='confirmed';
    if not found then raise exception 'Confirmed topic required' using errcode='42501'; end if;
  else
    select count(*) into topic_count from public.goal_topics where goal_id=p_goal and user_id=uid and status='confirmed'
      and lower(regexp_replace(title,'\s+','','g'))=lower(regexp_replace(btrim(p_title),'\s+','','g'));
    if topic_count>1 then raise exception 'Choose the existing topic explicitly' using errcode='23514'; end if;
    select * into t from public.goal_topics where goal_id=p_goal and user_id=uid and status='confirmed'
      and lower(regexp_replace(title,'\s+','','g'))=lower(regexp_replace(btrim(p_title),'\s+','','g'));
    if not found then
      insert into public.goal_topics(user_id,goal_id,title,source_type,metadata)
      values(uid,p_goal,btrim(p_title),'user','{"schema_version":1,"origin":"chat"}'::jsonb) returning * into t;
      created:=true;
    end if;
  end if;
  insert into public.topic_observations(user_id,goal_id,topic_id,learning_status,self_rating,memo,observed_at,request_id,recorded_via)
  values(uid,p_goal,t.id,p_status,p_rating,'',p_observed_at,p_request,'chat') returning id into result;
  return jsonb_build_object('observation_id',result,'topic_id',t.id,'title',t.title,'created',created);
end; $$;

create function public.void_chat_topic_observation(p_observation uuid) returns void
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); o public.topic_observations%rowtype;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,32));
  select * into o from public.topic_observations where id=p_observation and user_id=uid and recorded_via='chat' for update;
  if not found then raise exception 'Chat observation not found' using errcode='42501'; end if;
  update public.topic_observations set voided_at=coalesce(voided_at,now()) where id=o.id and user_id=uid;
  -- Keep a shared topic and all later/manual evidence; an empty topic is harmless.
end; $$;

create function public.revise_chat_topic_observation(p_observation uuid,p_status text,p_rating integer,p_request uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); o public.topic_observations%rowtype; previous public.topic_observations%rowtype; result uuid;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,32));
  if p_request is null or p_status is null or p_status not in ('not_started','in_progress','needs_review','understood')
    or (p_rating is not null and p_rating not between 1 and 5) or (p_status='not_started' and p_rating is not null) then
    raise exception 'Invalid chat revision' using errcode='22023';
  end if;
  select * into previous from public.topic_observations where user_id=uid and request_id=p_request;
  if found then
    if previous.supersedes_id is distinct from p_observation or previous.learning_status<>p_status
      or previous.self_rating is distinct from p_rating or previous.voided_at is not null then
      raise exception 'Revision request changed' using errcode='23514';
    end if;
    return previous.id;
  end if;
  select * into o from public.topic_observations where id=p_observation and user_id=uid and recorded_via='chat' and voided_at is null for update;
  if not found or not exists(select 1 from public.goal_topics where id=o.topic_id and user_id=uid and status='confirmed')
    or not exists(select 1 from public.learning_goals where id=o.goal_id and user_id=uid and status='active') then
    raise exception 'Available chat observation required' using errcode='42501';
  end if;
  update public.topic_observations set voided_at=now() where id=o.id and user_id=uid;
  insert into public.topic_observations(user_id,goal_id,topic_id,learning_status,self_rating,memo,observed_at,request_id,recorded_via,supersedes_id)
  values(uid,o.goal_id,o.topic_id,p_status,p_rating,'',o.observed_at,p_request,'chat',o.id) returning id into result;
  return result;
end; $$;

revoke all on function public.record_chat_topic_observation(uuid,uuid,text,text,integer,timestamptz,uuid),
  public.void_chat_topic_observation(uuid),public.revise_chat_topic_observation(uuid,text,integer,uuid) from public,anon;
grant execute on function public.record_chat_topic_observation(uuid,uuid,text,text,integer,timestamptz,uuid),
  public.void_chat_topic_observation(uuid),public.revise_chat_topic_observation(uuid,text,integer,uuid) to authenticated;

create function public.set_chat_problem_levels(p_changes jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); change jsonb; p public.problem_bank_problems%rowtype; result jsonb:='[]';
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,32));
  if p_changes is null or jsonb_typeof(p_changes)<>'array' or jsonb_array_length(p_changes) not between 1 and 30
    or (select count(distinct v->>'id') from jsonb_array_elements(p_changes) v)<>jsonb_array_length(p_changes) then
    raise exception 'Invalid problem changes' using errcode='22023';
  end if;
  for change in select value from jsonb_array_elements(p_changes) order by value->>'id' loop
    if jsonb_typeof(change->'level')<>'number' or (change->>'level')!~'^[0-5]$' or change->>'expected' is null then
      raise exception 'Invalid problem stage' using errcode='22023';
    end if;
    select * into p from public.problem_bank_problems where id=(change->>'id')::uuid and user_id=uid for update;
    if not found or p.updated_at is distinct from (change->>'expected')::timestamptz then
      raise exception '문항이 변경됐습니다. 최신 기록에서 다시 시도해 주세요.' using errcode='40001';
    end if;
    update public.problem_bank_problems set level=(change->>'level')::integer where id=p.id and user_id=uid returning * into p;
    result:=result||jsonb_build_array(jsonb_build_object('id',p.id,'updated_at',p.updated_at));
  end loop;
  return result;
end; $$;
revoke all on function public.set_chat_problem_levels(jsonb) from public,anon;
grant execute on function public.set_chat_problem_levels(jsonb) to authenticated;

-- This follows the app's academic-term buckets, not an inferred university syllabus.
-- An explicitly dated class slot takes precedence over these fallback bounds.
create function public.coaching_term_bounds(p_term text) returns daterange
language plpgsql immutable set search_path='' as $$
declare parts text[]; y integer; season text;
begin
  parts:=regexp_match(btrim(p_term),'^([0-9]{4})(?:년[ ]*|-)(1학기|2학기|여름학기|겨울학기|1|2)$');
  if parts is null then return null; end if;
  y:=parts[1]::integer; season:=parts[2];
  if y<1 or y>9998 then return null; end if;
  if season in ('1','1학기') then return daterange(make_date(y,3,1),make_date(y,7,1),'[)'); end if;
  if season='여름학기' then return daterange(make_date(y,7,1),make_date(y,9,1),'[)'); end if;
  if season in ('2','2학기') then return daterange(make_date(y,9,1),make_date(y+1,1,1),'[)'); end if;
  return daterange(make_date(y+1,1,1),make_date(y+1,3,1),'[)');
end; $$;
revoke all on function public.coaching_term_bounds(text) from public,anon;
grant execute on function public.coaching_term_bounds(text) to authenticated,service_role;

create view public.coaching_course_schedules with (security_invoker=true) as
  select s.id,s.user_id,s.course_id,s.day_of_week,s.start_time,s.end_time,
    case when s.effective_from is null and s.effective_to is null then lower(public.coaching_term_bounds(c.term)) else s.effective_from end as effective_from,
    case when s.effective_from is null and s.effective_to is null then upper(public.coaching_term_bounds(c.term))-1 else s.effective_to end as effective_to
  from public.course_schedules s join public.courses c on c.id=s.course_id and c.user_id=s.user_id
  where c.status='active';
revoke all on public.coaching_course_schedules from public,anon;
grant select on public.coaching_course_schedules to authenticated,service_role;

create or replace view public.coaching_problem_bank_states with (security_invoker=true) as
  select p.id,p.user_id,p.subject_id,p.label,p.level,p.level_recorded_at,p.updated_at,
    s.name as subject_name,l.goal_id,l.topic_id,p.source_file
  from public.problem_bank_problems p
  join public.problem_bank_subjects s on s.id=p.subject_id and s.user_id=p.user_id
  join public.problem_bank_coaching_links l on l.subject_id=p.subject_id and l.user_id=p.user_id;

create function public.postpone_coaching_plan_item(p_item uuid,p_expected_start timestamptz,p_request uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); i public.study_plan_items%rowtype; p public.study_plans%rowtype;
  contract jsonb; budget jsonb; tz text; new_start timestamptz; new_end timestamptz; local_day date; buffer interval;
  first_day date; last_day date;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,32));
  select * into i from public.study_plan_items where id=p_item and user_id=uid for update;
  if not found then raise exception '계획 항목을 찾지 못했습니다.' using errcode='42501'; end if;
  if p_request is null then raise exception '요청 번호를 확인해 주세요.' using errcode='22023'; end if;
  if i.metadata->>'postpone_request_id'=p_request::text then return i.id; end if;
  if i.status<>'planned' or i.scheduled_start is null or i.scheduled_end is null
    or i.scheduled_start is distinct from p_expected_start then
    raise exception '계획이 변경됐습니다. 새로 불러온 뒤 다시 시도해 주세요.' using errcode='40001';
  end if;
  select * into p from public.study_plans where id=i.plan_id and user_id=uid and source_type='ai' and status in ('approved','active') for update;
  if not found then raise exception '변경 가능한 AI 계획이 아닙니다.' using errcode='23514'; end if;
  if not exists(select 1 from public.learning_goals where id=i.goal_id and user_id=uid and status='active') then
    raise exception '활성 학습 목표의 계획만 미룰 수 있습니다.' using errcode='23514';
  end if;
  select context_snapshot->'execution_contract' into contract from public.coaching_runs where id=p.coaching_run_id and user_id=uid;
  select coalesce((select timezone from public.user_preferences where user_id=uid),contract->>'timezone','Asia/Seoul') into tz;
  if not exists(select 1 from pg_timezone_names where name=tz) then raise exception '시간대 설정을 확인해 주세요.'; end if;
  new_start:=((i.scheduled_start at time zone tz)+interval '1 day') at time zone tz;
  new_end:=new_start+(i.scheduled_end-i.scheduled_start);
  local_day:=(new_start at time zone tz)::date;
  buffer:=make_interval(mins=>greatest(0,least(60,coalesce((contract#>>'{rules,transition_minutes}')::integer,10))));
  if new_start<now() then raise exception '이미 지난 시간입니다. 새 계획을 생성해 주세요.' using errcode='23514'; end if;
  select value into budget from jsonb_array_elements(coalesce(contract->'day_budgets','[]'::jsonb)) where value->>'date'=local_day::text;
  if budget is null or not exists(select 1 from jsonb_array_elements(coalesce(budget->'windows','[]'::jsonb)) w
    where new_start>=((local_day+(w->>'start')::time) at time zone tz) and new_end<=((local_day+(w->>'end')::time) at time zone tz))
    or i.planned_minutes+coalesce((select sum(other.planned_minutes) from public.study_plan_items other
      where other.user_id=uid and other.id<>i.id and other.status='planned' and (other.scheduled_start at time zone tz)::date=local_day),0)>(budget->>'minutes')::integer then
    raise exception '다음날 확인된 학습 시간대나 학습량을 벗어납니다. 가용시간을 확인하고 다시 계획해 주세요.' using errcode='23514';
  end if;
  if exists(select 1 from public.calendar_events e where e.user_id=uid and e.status='scheduled' and e.is_blocking
    and new_start<e.ends_at+buffer and new_end>e.starts_at-buffer)
    or exists(select 1 from public.study_plan_items other where other.user_id=uid and other.id<>i.id and other.status='planned'
      and new_start<other.scheduled_end+buffer and new_end>other.scheduled_start-buffer)
    or exists(select 1 from public.recurring_commitments c where c.user_id=uid and c.is_blocking
      and c.day_of_week=extract(dow from local_day)::integer and (c.effective_from is null or c.effective_from<=local_day)
      and (c.effective_to is null or c.effective_to>=local_day)
      and new_start<((local_day+c.end_time) at time zone tz)+buffer and new_end>((local_day+c.start_time) at time zone tz)-buffer)
    or exists(select 1 from public.coaching_course_schedules c where c.user_id=uid
      and c.day_of_week=extract(dow from local_day)::integer and (c.effective_from is null or c.effective_from<=local_day)
      and (c.effective_to is null or c.effective_to>=local_day)
      and new_start<((local_day+c.end_time) at time zone tz)+buffer and new_end>((local_day+c.start_time) at time zone tz)-buffer) then
    raise exception '다음날 같은 시간에 일정이 겹칩니다. 가용시간을 확인하고 다시 계획해 주세요.' using errcode='23514';
  end if;
  if exists(select 1 from public.calendar_events e where e.user_id=uid and e.goal_id=i.goal_id and e.status='scheduled'
    and e.event_type in ('exam','quiz','assignment','project')
    and (case when e.event_type in ('exam','quiz') then coalesce(e.starts_at,e.due_at) else coalesce(e.due_at,e.starts_at) end)>=i.scheduled_start
    and (case when e.event_type in ('exam','quiz') then coalesce(e.starts_at,e.due_at) else coalesce(e.due_at,e.starts_at) end)<new_end)
    or exists(select 1 from jsonb_array_elements(coalesce(contract->'exams','[]'::jsonb)) e
      where e->>'goal_id'=i.goal_id::text and (e->>'exam_at')::timestamptz<new_end and (e->>'exam_at')::timestamptz>=i.scheduled_start)
    or exists(select 1 from public.learning_goals g where g.id=i.goal_id and g.user_id=uid
      and g.target_date>=(i.scheduled_start at time zone tz)::date and g.target_date<(new_end at time zone tz)::date) then
    raise exception '시험 또는 마감 이후로 미룰 수 없습니다. 남은 범위로 다시 계획해 주세요.' using errcode='23514';
  end if;
  update public.study_plan_items set scheduled_start=new_start,scheduled_end=new_end,
    metadata=metadata||jsonb_build_object('postpone_count',coalesce((metadata->>'postpone_count')::integer,0)+1,'postpone_request_id',p_request)
    where id=i.id and user_id=uid;
  select min((scheduled_start at time zone tz)::date),max((scheduled_end at time zone tz)::date) into first_day,last_day
    from public.study_plan_items where plan_id=p.id and user_id=uid and status not in ('cancelled','skipped');
  update public.study_plans set period_start=least(period_start,first_day),period_end=greatest(period_end,last_day),
    plan_horizon=case when plan_horizon='daily' and least(period_start,first_day)<>greatest(period_end,last_day) then 'custom' else plan_horizon end
    where id=p.id and user_id=uid;
  return i.id;
end; $$;
revoke all on function public.postpone_coaching_plan_item(uuid,timestamptz,uuid) from public,anon;
grant execute on function public.postpone_coaching_plan_item(uuid,timestamptz,uuid) to authenticated;

commit;
