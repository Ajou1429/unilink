begin;

-- Durable, immutable-on-success artifacts double as resumable work checkpoints.
-- The goal FK isolates different semesters/courses/personal studies and owners.
create table public.course_knowledge_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid not null,
  task_key text not null check(task_key ~ '^[a-f0-9]{64}$'),
  kind text not null check(kind in ('index','overview','detail','research','refresh')),
  note_id uuid,
  source_revision text,
  source_hash text,
  page_start integer,
  page_end integer,
  status text not null default 'processing' check(status in ('processing','ready','failed')),
  lease_token uuid not null default gen_random_uuid(),
  lease_until timestamptz not null default now()+interval '150 seconds',
  attempts integer not null default 1 check(attempts between 1 and 3),
  payload jsonb not null default '{}' check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=100000),
  usage_payload jsonb not null default '{}',
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,goal_id,task_key),
  foreign key(goal_id,user_id) references public.learning_goals(id,user_id) on delete cascade,
  foreign key(note_id,user_id) references public.notes(id,user_id) on delete cascade,
  check((kind='research' and note_id is null and page_start is null and page_end is null)
    or (kind in ('index','refresh') and note_id is not null and page_start is null and page_end is null)
    or (kind in ('overview','detail') and note_id is not null and page_start is not null and page_end is not null and page_start>=1 and page_end>=page_start and page_end<=50)),
  check(kind='research' or source_revision is not null)
);
create index course_knowledge_owner on public.course_knowledge_tasks(user_id,goal_id,created_at);
create index course_knowledge_active on public.course_knowledge_tasks(user_id,goal_id,lease_until) where status='processing';
alter table public.course_knowledge_tasks enable row level security;
revoke all on public.course_knowledge_tasks from public,anon,authenticated;
grant select on public.course_knowledge_tasks to authenticated;
grant all on public.course_knowledge_tasks to service_role;
create policy own_course_knowledge on public.course_knowledge_tasks for select to authenticated using(user_id=(select auth.uid()));

create function public.claim_course_knowledge_task(p_user uuid,p_goal uuid,p_task jsonb,p_retry boolean default false)
returns public.course_knowledge_tasks language plpgsql security definer set search_path='' as $$
declare old public.course_knowledge_tasks%rowtype; result public.course_knowledge_tasks%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text,26));
  if not exists(select 1 from public.learning_goals where id=p_goal and user_id=p_user and status='active') then raise exception 'Unavailable learning goal'; end if;
  if p_task->>'note_id' is not null and not exists(select 1 from public.notes where id=(p_task->>'note_id')::uuid and user_id=p_user) then raise exception 'Unavailable note'; end if;
  select * into old from public.course_knowledge_tasks where user_id=p_user and goal_id=p_goal and task_key=p_task->>'task_key' for update;
  if found then
    if old.status='ready' or (old.status='processing' and old.lease_until>now()) then return null; end if;
    if old.attempts>=3 then
      if old.status='processing' then update public.course_knowledge_tasks set status='failed',error_message='Retry limit reached. Check API/source configuration.' where id=old.id; end if;
      return null;
    end if;
    if old.status='failed' and not p_retry then return null; end if;
  end if;
  -- One billable operation per owner, even across goals/tabs. Expired leases can resume.
  if exists(select 1 from public.course_knowledge_tasks where user_id=p_user and status='processing' and lease_until>now()) then return null; end if;
  if (select coalesce(sum(attempts),0) from public.course_knowledge_tasks where user_id=p_user and updated_at>now()-interval '24 hours')>=60 then
    raise exception 'Knowledge analysis limit reached (60 steps / 24h)';
  end if;
  insert into public.course_knowledge_tasks(user_id,goal_id,task_key,kind,note_id,source_revision,source_hash,page_start,page_end)
    values(p_user,p_goal,p_task->>'task_key',p_task->>'kind',(p_task->>'note_id')::uuid,p_task->>'source_revision',p_task->>'source_hash',
      (p_task->>'page_start')::integer,(p_task->>'page_end')::integer)
    on conflict(user_id,goal_id,task_key) do update set status='processing',lease_token=gen_random_uuid(),lease_until=now()+interval '150 seconds',
      attempts=public.course_knowledge_tasks.attempts+1,error_message=null,updated_at=now()
    returning * into result;
  return result;
end; $$;

-- The lease comparison fences late workers; source comparison and publication are atomic.
create function public.publish_course_knowledge_task(p_user uuid,p_id uuid,p_lease uuid,p_payload jsonb,p_usage jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare t public.course_knowledge_tasks%rowtype; n public.notes%rowtype;
begin
  select * into t from public.course_knowledge_tasks where id=p_id and user_id=p_user for update;
  if not found or t.status<>'processing' or t.lease_token is distinct from p_lease or t.lease_until<now() then raise exception 'Knowledge lease expired'; end if;
  if t.note_id is not null then
    select * into n from public.notes where id=t.note_id and user_id=p_user for share;
    if not found or n.version is distinct from (p_payload->>'note_version')::integer or n.updated_at is distinct from (p_payload->>'note_updated_at')::timestamptz then
      raise exception 'Note changed during analysis';
    end if;
  end if;
  update public.course_knowledge_tasks set status='ready',payload=p_payload,usage_payload=p_usage,updated_at=now(),error_message=null where id=t.id;
end; $$;
revoke all on function public.claim_course_knowledge_task(uuid,uuid,jsonb,boolean),public.publish_course_knowledge_task(uuid,uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.claim_course_knowledge_task(uuid,uuid,jsonb,boolean),public.publish_course_knowledge_task(uuid,uuid,uuid,jsonb,jsonb) to service_role;
commit;
