begin;
alter table public.notes add constraint notes_id_owner_unique unique(id,user_id);
create table public.note_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  note_id uuid not null references public.notes(id) on delete cascade,
  note_version integer not null,
  note_updated_at timestamptz not null,
  source_hash text,
  page_count integer,
  status text not null default 'processing' check(status in ('processing','completed','failed')),
  summary text not null default '',
  error_message text,
  model_name text not null,
  prompt_version text not null default 'note-extraction-v1',
  usage_payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique(id,user_id),
  foreign key(note_id,user_id) references public.notes(id,user_id) on delete cascade
);
create unique index note_analysis_active on public.note_analyses(note_id) where status='processing';
create index note_analysis_owner on public.note_analyses(user_id,note_id,created_at desc);
create table public.note_analysis_candidates (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check(kind in ('topic','assignment','exam')),
  title text not null check(length(title) between 1 and 200),
  description text not null default '' check(length(description)<=3000),
  exam_scope text not null default '' check(length(exam_scope)<=2000),
  date_text text not null default '',
  page integer not null check(page>0),
  quote text not null check(length(quote) between 1 and 1500),
  status text not null default 'pending' check(status in ('pending','accepted','rejected')),
  target_id uuid,
  foreign key(analysis_id,user_id) references public.note_analyses(id,user_id) on delete cascade
);
create index note_candidates_owner on public.note_analysis_candidates(user_id,analysis_id);
alter table public.note_analyses enable row level security;
alter table public.note_analysis_candidates enable row level security;
revoke all on public.note_analyses,public.note_analysis_candidates from public,anon,authenticated;
grant select on public.note_analyses,public.note_analysis_candidates to authenticated;
grant all on public.note_analyses,public.note_analysis_candidates to service_role;
create policy own_analysis on public.note_analyses for select to authenticated using(user_id=(select auth.uid()));
create policy own_candidate on public.note_analysis_candidates for select to authenticated using(user_id=(select auth.uid()));

create function public.reserve_note_analysis(p_note uuid,p_user uuid,p_model text) returns uuid
language plpgsql security definer set search_path='' as $$
declare n public.notes%rowtype; result uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 20));
  select * into n from public.notes where id=p_note and user_id=p_user;
  if not found then raise exception '노트를 찾을 수 없습니다.'; end if;
  update public.note_analyses set status='failed',error_message='분석 시간이 초과되었습니다. 다시 시도해 주세요.'
    where user_id=p_user and status='processing' and created_at<now()-interval '4 minutes';
  if (select count(*) from public.note_analyses where user_id=p_user and created_at>now()-interval '24 hours')>=5 then
    raise exception '자료 분석은 24시간 동안 최대 5회 가능합니다.';
  end if;
  if exists(select 1 from public.note_analyses where user_id=p_user and status='processing') then
    raise exception '진행 중인 자료 분석이 있습니다. 완료 후 다시 시도해 주세요.';
  end if;
  insert into public.note_analyses(user_id,note_id,note_version,note_updated_at,model_name)
    values(p_user,p_note,n.version,n.updated_at,p_model) returning id into result;
  return result;
end; $$;
revoke all on function public.reserve_note_analysis(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.reserve_note_analysis(uuid,uuid,text) to service_role;

create function public.confirm_note_candidate(p_candidate uuid,p_goal uuid,p_title text,p_description text,
  p_scope text,p_at timestamptz default null,p_end timestamptz default null,p_reject boolean default false) returns uuid
language plpgsql security definer set search_path='' as $$
declare c public.note_analysis_candidates%rowtype; a public.note_analyses%rowtype; n public.notes%rowtype;
  g public.learning_goals%rowtype; result uuid;
begin
  select * into c from public.note_analysis_candidates where id=p_candidate and user_id=auth.uid() for update;
  if not found then raise exception '후보를 확인할 수 없습니다.'; end if;
  if c.status='accepted' then return c.target_id; end if;
  if c.status='rejected' then raise exception '제외한 후보입니다.'; end if;
  select * into a from public.note_analyses where id=c.analysis_id and user_id=auth.uid();
  select * into n from public.notes where id=a.note_id and user_id=auth.uid() for share;
  if not found or a.status<>'completed' or n.version<>a.note_version or n.updated_at<>a.note_updated_at then
    raise exception '자료가 변경되었습니다. 다시 분석해 주세요.';
  end if;
  if p_reject then update public.note_analysis_candidates set status='rejected' where id=c.id; return null; end if;
  select * into g from public.learning_goals where id=p_goal and user_id=auth.uid() and status='active';
  if not found then raise exception '학습 목표를 확인해 주세요.'; end if;
  if p_title is null or p_description is null or p_scope is null or length(btrim(p_title)) not between 1 and 200 or length(p_description)>3000 or length(p_scope)>2000 then raise exception '입력 길이를 확인해 주세요.'; end if;
  if c.kind='topic' then
    insert into public.goal_topics(user_id,goal_id,title,source_type,metadata)
      values(auth.uid(),g.id,btrim(p_title),'material_analysis',jsonb_build_object('schema_version',1,'candidate_id',c.id,'note_id',n.id,'page',c.page,'quote',c.quote,'description',p_description)) returning id into result;
  else
    if p_at is null or (c.kind='exam' and (p_end is null or p_end<=p_at)) then raise exception '날짜와 종료 시간을 확인해 주세요.'; end if;
    insert into public.calendar_events(user_id,goal_id,event_type,title,description,exam_scope,starts_at,ends_at,due_at,is_blocking,metadata)
      values(auth.uid(),g.id,c.kind,btrim(p_title),p_description,p_scope,
        case when c.kind='exam' then p_at end,case when c.kind='exam' then p_end end,
        case when c.kind='assignment' then p_at end,c.kind='exam',
        jsonb_build_object('schema_version',1,'candidate_id',c.id,'note_id',n.id,'page',c.page,'quote',c.quote)) returning id into result;
  end if;
  update public.note_analysis_candidates set status='accepted',target_id=result where id=c.id;
  return result;
end; $$;
revoke all on function public.confirm_note_candidate(uuid,uuid,text,text,text,timestamptz,timestamptz,boolean) from public,anon;
grant execute on function public.confirm_note_candidate(uuid,uuid,text,text,text,timestamptz,timestamptz,boolean) to authenticated;
commit;
