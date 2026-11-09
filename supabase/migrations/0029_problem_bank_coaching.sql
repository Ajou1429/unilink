begin;

create table public.problem_bank_coaching_links (
  subject_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid not null,
  topic_id uuid,
  updated_at timestamptz not null default now(),
  primary key(subject_id,user_id),
  foreign key(subject_id,user_id) references public.problem_bank_subjects(id,user_id) on delete cascade,
  foreign key(goal_id,user_id) references public.learning_goals(id,user_id) on delete cascade,
  foreign key(topic_id,goal_id,user_id) references public.goal_topics(id,goal_id,user_id) on delete set null(topic_id)
);
alter table public.problem_bank_coaching_links enable row level security;
revoke all on public.problem_bank_coaching_links from public,anon,authenticated;
grant select,insert,update,delete on public.problem_bank_coaching_links to authenticated;
grant all on public.problem_bank_coaching_links to service_role;
create policy own_bank_coaching_links on public.problem_bank_coaching_links
  for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create index bank_coaching_goal_owner on public.problem_bank_coaching_links(goal_id,user_id);
create trigger bank_coaching_link_updated before update on public.problem_bank_coaching_links
  for each row execute function public.set_updated_at();

-- Preserve legacy values; no fabricated observation time for imported/default stages.
alter table public.problem_bank_problems add column level_recorded_at timestamptz;
create function public.record_problem_bank_level_time() returns trigger
language plpgsql set search_path='' as $$
begin
  new.level_recorded_at := now();
  return new;
end; $$;
create trigger problem_bank_level_observed before update of level on public.problem_bank_problems
  for each row execute function public.record_problem_bank_level_time();

create view public.coaching_problem_bank_states with(security_invoker=true) as
  select p.id,p.user_id,p.subject_id,p.label,p.level,p.level_recorded_at,p.updated_at,
    s.name as subject_name,l.goal_id,l.topic_id
  from public.problem_bank_problems p
  join public.problem_bank_subjects s on s.id=p.subject_id and s.user_id=p.user_id
  join public.problem_bank_coaching_links l on l.subject_id=p.subject_id and l.user_id=p.user_id;
revoke all on public.coaching_problem_bank_states from public,anon,authenticated;
grant select on public.coaching_problem_bank_states to authenticated,service_role;
comment on table public.problem_bank_coaching_links is
  'Explicit bank-subject to learning-goal mapping. Optional topic applies to the whole bank subject; never matched by name.';
commit;
