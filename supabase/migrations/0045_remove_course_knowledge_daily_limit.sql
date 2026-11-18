begin;

create or replace function public.claim_course_knowledge_task(p_user uuid,p_goal uuid,p_task jsonb,p_retry boolean default false)
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
  if exists(select 1 from public.course_knowledge_tasks where user_id=p_user and status='processing' and lease_until>now()) then return null; end if;
  insert into public.course_knowledge_tasks(user_id,goal_id,task_key,kind,note_id,source_revision,source_hash,page_start,page_end)
    values(p_user,p_goal,p_task->>'task_key',p_task->>'kind',(p_task->>'note_id')::uuid,p_task->>'source_revision',p_task->>'source_hash',
      (p_task->>'page_start')::integer,(p_task->>'page_end')::integer)
    on conflict(user_id,goal_id,task_key) do update set status='processing',lease_token=gen_random_uuid(),lease_until=now()+interval '150 seconds',
      attempts=public.course_knowledge_tasks.attempts+1,error_message=null,updated_at=now()
    returning * into result;
  return result;
end; $$;

commit;
