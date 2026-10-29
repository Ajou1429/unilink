begin;
create table public.topic_observations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid not null,
  topic_id uuid not null,
  session_id uuid,
  note_id uuid,
  learning_status text not null check(learning_status in ('not_started','in_progress','needs_review','understood')),
  self_rating smallint check(self_rating between 1 and 5),
  memo text not null default '' check(length(memo)<=1000),
  page_start integer check(page_start>0),
  page_end integer check(page_end>0),
  source text not null default 'self_report' check(source='self_report'),
  observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  request_id uuid not null,
  unique(user_id,request_id),
  foreign key(topic_id,goal_id,user_id) references public.goal_topics(id,goal_id,user_id) on delete cascade,
  foreign key(session_id,user_id) references public.course_sessions(id,user_id) on delete set null(session_id),
  foreign key(note_id,user_id) references public.notes(id,user_id) on delete set null(note_id),
  check(learning_status<>'not_started' or self_rating is null),
  check((page_start is null and page_end is null) or (page_start is not null and page_end is not null and page_end>=page_start))
);
create index topic_observations_latest on public.topic_observations(user_id,goal_id,topic_id,observed_at desc,created_at desc,id desc);
alter table public.topic_observations enable row level security;
revoke all on public.topic_observations from public,anon,authenticated;
grant select on public.topic_observations to authenticated;
grant all on public.topic_observations to service_role;
create policy own_observations on public.topic_observations for select to authenticated using(user_id=(select auth.uid()));

create view public.topic_learning_states with(security_invoker=true) as
  select distinct on (o.user_id,o.topic_id) o.*,s.session_date
  from public.topic_observations o
  left join public.course_sessions s on s.id=o.session_id and s.user_id=o.user_id
  order by o.user_id,o.topic_id,o.observed_at desc,o.created_at desc,o.id desc;
revoke all on public.topic_learning_states from public,anon;
grant select on public.topic_learning_states to authenticated,service_role;

create function public.record_topic_observation(p_topic uuid,p_status text,p_rating integer,p_memo text,
  p_observed_at timestamptz,p_session uuid,p_note uuid,p_page_start integer,p_page_end integer,p_request uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare t public.goal_topics%rowtype; g public.learning_goals%rowtype; existing public.topic_observations%rowtype; result uuid;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  select * into t from public.goal_topics where id=p_topic and user_id=auth.uid() and status='confirmed';
  if not found then raise exception '학습 주제를 확인해 주세요.'; end if;
  select * into g from public.learning_goals where id=t.goal_id and user_id=auth.uid() and status='active';
  if not found then raise exception '활성 학습 목표를 확인해 주세요.'; end if;
  if p_status is null or p_status not in ('not_started','in_progress','needs_review','understood') or
    (p_rating is not null and p_rating not between 1 and 5) or (p_status='not_started' and p_rating is not null) or
    p_memo is null or length(p_memo)>1000 or p_request is null or p_observed_at is null or p_observed_at>now()+interval '5 minutes' then
    raise exception '상태·이해도·기록 시각을 확인해 주세요.';
  end if;
  if p_session is not null and not exists(select 1 from public.course_sessions where id=p_session and user_id=auth.uid() and course_id=g.course_id) then
    raise exception '같은 수업의 회차를 선택해 주세요.';
  end if;
  if p_note is not null and not exists(select 1 from public.notes where id=p_note and user_id=auth.uid()) then raise exception '연결할 노트를 확인해 주세요.'; end if;
  if (p_page_start is null)<>(p_page_end is null) or (p_page_start is not null and (p_note is null or p_page_start<1 or p_page_end<p_page_start)) then
    raise exception '노트와 페이지 범위를 확인해 주세요.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_request::text,24));
  select * into existing from public.topic_observations where user_id=auth.uid() and request_id=p_request;
  if found then
    if row(existing.topic_id,existing.learning_status,existing.self_rating,existing.memo,existing.observed_at,existing.session_id,existing.note_id,existing.page_start,existing.page_end)
      is distinct from row(p_topic,p_status,p_rating,p_memo,p_observed_at,p_session,p_note,p_page_start,p_page_end) then raise exception '다른 내용에 같은 요청 번호를 사용할 수 없습니다.'; end if;
    return existing.id;
  end if;
  insert into public.topic_observations(user_id,goal_id,topic_id,learning_status,self_rating,memo,observed_at,session_id,note_id,page_start,page_end,request_id)
    values(auth.uid(),t.goal_id,t.id,p_status,p_rating,p_memo,p_observed_at,p_session,p_note,p_page_start,p_page_end,p_request) returning id into result;
  if p_session is not null then
    insert into public.course_session_topics(user_id,session_id,course_id,goal_id,topic_id)
      values(auth.uid(),p_session,g.course_id,g.id,t.id) on conflict(session_id,topic_id) do nothing;
  end if;
  return result;
end; $$;
revoke all on function public.record_topic_observation(uuid,text,integer,text,timestamptz,uuid,uuid,integer,integer,uuid) from public,anon;
grant execute on function public.record_topic_observation(uuid,text,integer,text,timestamptz,uuid,uuid,integer,integer,uuid) to authenticated;
commit;
