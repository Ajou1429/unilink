begin;

create table public.topic_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid not null,
  topic_id uuid not null,
  note_id uuid not null,
  candidate_id uuid not null references public.note_analysis_candidates(id) on delete cascade,
  note_version integer not null,
  note_updated_at timestamptz not null,
  evidence jsonb not null,
  request_id uuid not null,
  status text not null default 'processing' check(status in ('processing','ready','failed')),
  generation_started boolean not null default false,
  questions jsonb not null default '[]' check(jsonb_typeof(questions)='array'),
  model_name text not null,
  prompt_version text not null default 'topic-check-v1',
  usage_payload jsonb not null default '{}',
  error_message text,
  created_at timestamptz not null default now(),
  unique(id,user_id), unique(user_id,request_id),
  foreign key(topic_id,goal_id,user_id) references public.goal_topics(id,goal_id,user_id) on delete cascade,
  foreign key(note_id,user_id) references public.notes(id,user_id) on delete cascade
);
create index topic_checks_owner on public.topic_checks(user_id,topic_id,created_at desc);

-- Never grant browser access to answer keys, even for its own questions.
create table public.topic_check_keys (
  check_id uuid primary key references public.topic_checks(id) on delete cascade,
  answer_key jsonb not null check(jsonb_typeof(answer_key)='array')
);
create table public.topic_check_attempts (
  id uuid primary key default gen_random_uuid(),
  check_id uuid not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid not null,
  topic_id uuid not null,
  answers jsonb not null,
  results jsonb not null,
  correct_count integer not null check(correct_count between 0 and 3),
  question_count integer not null check(question_count=3),
  source text not null default 'generated_mcq' check(source='generated_mcq'),
  grader_version text not null default 'exact-choice-v1',
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key(check_id,user_id) references public.topic_checks(id,user_id) on delete cascade,
  foreign key(topic_id,goal_id,user_id) references public.goal_topics(id,goal_id,user_id) on delete cascade
);
create index topic_check_attempts_latest on public.topic_check_attempts(user_id,topic_id,created_at desc,id desc);
alter table public.topic_checks enable row level security;
alter table public.topic_check_keys enable row level security;
alter table public.topic_check_attempts enable row level security;
revoke all on public.topic_checks,public.topic_check_keys,public.topic_check_attempts from public,anon,authenticated;
grant select on public.topic_checks,public.topic_check_attempts to authenticated;
grant all on public.topic_checks,public.topic_check_keys,public.topic_check_attempts to service_role;
create policy own_topic_checks on public.topic_checks for select to authenticated using(user_id=(select auth.uid()));
create policy own_check_attempts on public.topic_check_attempts for select to authenticated using(user_id=(select auth.uid()));
grant select(id,user_id,version,updated_at) on public.notes to authenticated;
create view public.topic_check_states with(security_invoker=true) as
  select distinct on (r.user_id,r.topic_id) r.*,q.note_id,q.note_version,
    (q.note_version<>n.version or q.note_updated_at<>n.updated_at) as source_stale
  from public.topic_check_attempts r
  join public.topic_checks q on q.id=r.check_id and q.user_id=r.user_id
  join public.notes n on n.id=q.note_id and n.user_id=q.user_id
  order by r.user_id,r.topic_id,r.created_at desc,r.id desc;
revoke all on public.topic_check_states from public,anon;
grant select on public.topic_check_states to authenticated,service_role;

create function public.reserve_topic_check(p_user uuid,p_topic uuid,p_request uuid,p_model text) returns uuid
language plpgsql security definer set search_path='' as $$
declare t public.goal_topics%rowtype; c public.note_analysis_candidates%rowtype;
  a public.note_analyses%rowtype; n public.notes%rowtype; old public.topic_checks%rowtype; result uuid;
begin
  if p_user is null or p_request is null or p_model is null then raise exception '요청을 확인해 주세요.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user::text,25));
  select * into old from public.topic_checks where user_id=p_user and request_id=p_request;
  if found then
    if old.topic_id<>p_topic then raise exception '다른 주제에 같은 요청 번호를 사용할 수 없습니다.'; end if;
    return old.id;
  end if;
  select * into t from public.goal_topics where id=p_topic and user_id=p_user and status='confirmed';
  if not found or not exists(select 1 from public.learning_goals where id=t.goal_id and user_id=p_user and status='active') then
    raise exception '활성 목표의 확정 주제를 선택해 주세요.';
  end if;
  select * into c from public.note_analysis_candidates where id::text=t.metadata->>'candidate_id'
    and user_id=p_user and kind='topic' and status='accepted' and target_id=t.id;
  if not found then raise exception '노트 PDF를 분석하고 주제 후보를 확인해 등록한 뒤 사용할 수 있습니다.'; end if;
  select * into a from public.note_analyses where id=c.analysis_id and user_id=p_user and status='completed';
  if not found then raise exception '완료된 노트 분석을 확인해 주세요.'; end if;
  select * into n from public.notes where id=a.note_id and user_id=p_user for share;
  if not found or n.version<>a.note_version or n.updated_at<>a.note_updated_at then
    raise exception '노트가 변경되었습니다. 새로 분석하고 주제를 등록해 주세요.';
  end if;
  update public.topic_checks set status='failed',error_message='생성 시간이 초과되었습니다. 다시 시도해 주세요.'
    where user_id=p_user and status='processing' and created_at<now()-interval '2 minutes';
  -- Reuse an unanswered check for the same source, but never treat a retest as an independent mastery proof.
  select q.* into old from public.topic_checks q where q.user_id=p_user and q.topic_id=t.id
    and q.candidate_id=c.id and q.note_version=n.version and q.note_updated_at=n.updated_at
    and q.prompt_version='topic-check-v1' and q.status in ('processing','ready')
    and not exists(select 1 from public.topic_check_attempts r where r.check_id=q.id)
    order by q.created_at desc limit 1;
  if found then return old.id; end if;
  if exists(select 1 from public.topic_checks where user_id=p_user and status='processing') then raise exception '진행 중인 확인 문제 생성이 있습니다.'; end if;
  if (select count(*) from public.topic_checks where user_id=p_user and created_at>now()-interval '24 hours')>=10 then
    raise exception '확인 문제 생성은 24시간 동안 최대 10회 가능합니다.';
  end if;
  insert into public.topic_checks(user_id,goal_id,topic_id,note_id,candidate_id,note_version,note_updated_at,request_id,model_name,evidence)
    values(p_user,t.goal_id,t.id,n.id,c.id,n.version,n.updated_at,p_request,p_model,
      jsonb_build_object('topic_title',t.title,'note_title',n.title,'analysis_id',a.id,'source_hash',a.source_hash,'page',c.page,'quote',c.quote))
    returning id into result;
  return result;
end; $$;
revoke all on function public.reserve_topic_check(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.reserve_topic_check(uuid,uuid,uuid,text) to service_role;

create function public.publish_topic_check(p_check uuid,p_user uuid,p_questions jsonb,p_key jsonb,p_usage jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare q public.topic_checks%rowtype;
begin
  select * into q from public.topic_checks where id=p_check and user_id=p_user for update;
  if not found or q.status<>'processing' then raise exception '생성 상태가 변경되었습니다.'; end if;
  if not exists(select 1 from public.notes where id=q.note_id and user_id=p_user and version=q.note_version and updated_at=q.note_updated_at for share) then
    raise exception '자료가 변경되었습니다. 다시 분석해 주세요.';
  end if;
  if jsonb_typeof(p_questions)<>'array' or jsonb_array_length(p_questions)<>3 or jsonb_typeof(p_key)<>'array' or jsonb_array_length(p_key)<>3 then
    raise exception '문항 형식을 확인해 주세요.';
  end if;
  insert into public.topic_check_keys(check_id,answer_key) values(q.id,p_key);
  update public.topic_checks set questions=p_questions,status='ready',usage_payload=p_usage where id=q.id;
end; $$;
revoke all on function public.publish_topic_check(uuid,uuid,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.publish_topic_check(uuid,uuid,jsonb,jsonb,jsonb) to service_role;

create function public.submit_topic_check(p_check uuid,p_answers jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare q public.topic_checks%rowtype; old public.topic_check_attempts%rowtype; keys jsonb; k jsonb;
  results jsonb='[]'; answer integer; correct integer=0; result uuid; i integer;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  select * into q from public.topic_checks where id=p_check and user_id=auth.uid() for update;
  if not found then raise exception '확인 문제를 찾을 수 없습니다.'; end if;
  select * into old from public.topic_check_attempts where check_id=q.id and user_id=auth.uid();
  if found then
    if old.answers is distinct from p_answers then raise exception '이미 제출했습니다. 다시 확인하려면 새 문제를 생성해 주세요.'; end if;
    return old.id;
  end if;
  if q.status<>'ready' then raise exception '문제 생성이 완료되지 않았습니다.'; end if;
  if not exists(select 1 from public.goal_topics t join public.learning_goals g on g.id=t.goal_id and g.user_id=t.user_id
    where t.id=q.topic_id and t.user_id=auth.uid() and t.status='confirmed' and g.status='active') then raise exception '활성 학습 주제를 확인해 주세요.'; end if;
  if not exists(select 1 from public.notes where id=q.note_id and user_id=auth.uid() and version=q.note_version and updated_at=q.note_updated_at for share) then
    raise exception '노트가 변경되었습니다. 새 문제로 확인해 주세요.';
  end if;
  if p_answers is null or jsonb_typeof(p_answers)<>'array' or jsonb_array_length(p_answers)<>3 then raise exception '세 문항에 모두 답해 주세요.'; end if;
  select answer_key into keys from public.topic_check_keys where check_id=q.id;
  if keys is null or jsonb_array_length(keys)<>3 then raise exception '채점 기준을 찾을 수 없습니다.'; end if;
  for i in 0..2 loop
    if jsonb_typeof(p_answers->i)<>'number' or (p_answers->>i)!~'^[0-3]$' then raise exception '유효한 보기를 선택해 주세요.'; end if;
    answer=(p_answers->>i)::integer; k=keys->i;
    if answer=(k->>'correct_index')::integer then correct=correct+1; end if;
    results=results||jsonb_build_array(jsonb_build_object('question_id',i+1,'selected_index',answer,
      'correct_index',(k->>'correct_index')::integer,'is_correct',answer=(k->>'correct_index')::integer,'explanation',k->>'explanation','evidence_quote',k->>'evidence_quote'));
  end loop;
  insert into public.topic_check_attempts(check_id,user_id,goal_id,topic_id,answers,results,correct_count,question_count)
    values(q.id,auth.uid(),q.goal_id,q.topic_id,p_answers,results,correct,3) returning id into result;
  return result;
end; $$;
revoke all on function public.submit_topic_check(uuid,jsonb) from public,anon;
grant execute on function public.submit_topic_check(uuid,jsonb) to authenticated;

create function public.void_topic_check(p_check uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  update public.topic_check_attempts set voided_at=coalesce(voided_at,now()) where check_id=p_check and user_id=auth.uid();
  if not found then raise exception '본인의 제출 결과를 선택해 주세요.'; end if;
end; $$;
revoke all on function public.void_topic_check(uuid) from public,anon;
grant execute on function public.void_topic_check(uuid) to authenticated;
commit;
