begin;

create table public.coaching_state_revisions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 0 check(revision>=0)
);
alter table public.coaching_state_revisions enable row level security;
revoke all on public.coaching_state_revisions from public,anon,authenticated;
grant select on public.coaching_state_revisions to service_role;

-- All participating writes take the same per-user lock as approval.
create function public.touch_coaching_state() returns trigger
language plpgsql security definer set search_path='' as $$
declare old_uid uuid; new_uid uuid; uid uuid;
begin
  if tg_op='UPDATE' and (to_jsonb(new)-'updated_at')=(to_jsonb(old)-'updated_at') then return new; end if;
  if tg_op <> 'INSERT' then old_uid:=old.user_id; end if;
  if tg_op <> 'DELETE' then new_uid:=new.user_id; end if;
  for uid in select distinct u from unnest(array[old_uid,new_uid]) u where u is not null order by u loop
    perform pg_advisory_xact_lock(hashtextextended(uid::text,32));
    if exists(select 1 from auth.users where id=uid) then
      insert into public.coaching_state_revisions(user_id,revision) values(uid,1)
      on conflict(user_id) do update set revision=public.coaching_state_revisions.revision+1;
    end if;
  end loop;
  if tg_op='DELETE' then return old; end if;
  return new;
end; $$;
revoke all on function public.touch_coaching_state() from public,anon,authenticated;
do $$ declare t text; begin
  foreach t in array array['calendar_events','recurring_commitments','courses','course_schedules','learning_goals','goal_topics','study_plan_items','notes','course_sessions','topic_observations','topic_check_attempts','course_knowledge_tasks','study_sessions','problem_bank_problems','problem_bank_coaching_links','user_preferences'] loop
    execute format('create trigger coaching_revision_change before insert or update or delete on public.%I for each row execute function public.touch_coaching_state()',t);
  end loop;
end; $$;

alter function public.approve_coaching_proposal(uuid) rename to approve_coaching_proposal_legacy;
revoke all on function public.approve_coaching_proposal_legacy(uuid) from public,anon,authenticated;

create function public.approve_coaching_proposal(p_run_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); r public.coaching_runs%rowtype; c jsonb; rev bigint; plan uuid;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,32));
  select * into r from public.coaching_runs where id=p_run_id and user_id=uid for update;
  if not found then raise exception 'Coaching proposal not found' using errcode='42501'; end if;
  if r.status='approved' then return public.approve_coaching_proposal_legacy(p_run_id); end if;
  if r.status<>'proposed' or r.expires_at<=now() then raise exception '제안이 만료되었거나 승인할 수 없습니다. 다시 생성해 주세요.' using errcode='23514'; end if;
  c:=r.context_snapshot->'execution_contract';
  if c is null or c->>'schema_version'<>'1' or c->>'scope'<>'confirmed_execution_only_no_free_text' then
    raise exception '이전 제안은 최신 일정 확인을 위해 다시 생성해 주세요.' using errcode='23514';
  end if;
  select coalesce((select revision from public.coaching_state_revisions where user_id=uid),0) into rev;
  if c->>'revision' is null or (c->>'revision')::bigint<>rev then
    raise exception '일정이나 학습 상태가 변경됐습니다. 최신 상태로 다시 생성해 주세요.' using errcode='40001';
  end if;
  if exists(select 1 from jsonb_array_elements(r.output_payload#>'{proposal,items}') v
    left join public.learning_goals g on g.id=(v->>'goal_id')::uuid and g.user_id=uid
    left join public.study_methods m on m.code=v->>'method_code'
    where g.id is null or g.status<>'active' or m.code is null or not m.active) then
    raise exception '학습 목표나 방법이 변경됐습니다. 다시 생성해 주세요.' using errcode='23514';
  end if;
  plan:=public.approve_coaching_proposal_legacy(p_run_id);
  update public.study_plan_items i set completion_criteria=coalesce(v.payload->'completion_criteria','{"schema_version":1}'::jsonb)
  from jsonb_array_elements(r.output_payload#>'{proposal,items}') with ordinality v(payload,n)
  where i.plan_id=plan and i.user_id=uid and i.priority_rank=v.n;
  return plan;
end; $$;
revoke all on function public.approve_coaching_proposal(uuid) from public,anon;
grant execute on function public.approve_coaching_proposal(uuid) to authenticated;
comment on function public.approve_coaching_proposal(uuid) is
 'Approves only fresh execution contracts under the same user lock as schedule/source writes. Legacy approved plans remain idempotent; old unapproved proposals require regeneration.';
commit;
