begin;

create table public.study_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null default 'manual' check (source_type in ('ai','manual','imported')),
  plan_horizon text not null check (plan_horizon in ('daily','weekly','monthly','exam_period','custom')),
  period_start date not null,
  period_end date not null,
  status text not null default 'draft' check (status in ('draft','approved','active','completed','cancelled')),
  parent_plan_id uuid,
  revision_no integer not null default 1 check (revision_no > 0),
  parent_revision_no integer generated always as (revision_no - 1) stored,
  idempotency_key text check (length(btrim(idempotency_key)) > 0),
  request_metadata jsonb not null default '{"schema_version":1}' check (public.p0_valid_metadata(request_metadata)),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,user_id),
  unique (id,user_id,revision_no),
  foreign key (parent_plan_id,user_id,parent_revision_no) references public.study_plans(id,user_id,revision_no) deferrable initially immediate,
  check (period_end >= period_start),
  check (plan_horizon <> 'daily' or period_end = period_start),
  check ((parent_plan_id is null and revision_no = 1) or (parent_plan_id is not null and revision_no > 1)),
  check (parent_plan_id is distinct from id),
  check (status not in ('approved','active','completed') or approved_at is not null)
);
create unique index study_plans_idempotency_unique on public.study_plans(user_id,idempotency_key) where idempotency_key is not null;
create unique index study_plans_revision_unique on public.study_plans(parent_plan_id,user_id) where parent_plan_id is not null;
create index study_plans_user_period_idx on public.study_plans(user_id,period_start,status);

create table public.study_plan_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid not null,
  goal_id uuid not null,
  topic_id uuid,
  method_code text not null references public.study_methods(code),
  title text not null check (length(btrim(title)) > 0),
  planned_minutes smallint not null check (planned_minutes > 0),
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  priority_rank integer check (priority_rank > 0),
  reason text,
  completion_criteria jsonb not null default '{"schema_version":1}' check (public.p0_valid_metadata(completion_criteria)),
  status text not null default 'planned' check (status in ('planned','completed','skipped','cancelled')),
  metadata jsonb not null default '{"schema_version":1}' check (public.p0_valid_metadata(metadata)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,user_id),
  unique (id,goal_id,user_id),
  foreign key (plan_id,user_id) references public.study_plans(id,user_id) deferrable initially immediate,
  foreign key (goal_id,user_id) references public.learning_goals(id,user_id) deferrable initially immediate,
  foreign key (topic_id,goal_id,user_id) references public.goal_topics(id,goal_id,user_id) deferrable initially immediate,
  check ((scheduled_start is null and scheduled_end is null)
    or (scheduled_start is not null and scheduled_end is not null and scheduled_end > scheduled_start
      and extract(epoch from (scheduled_end - scheduled_start)) >= planned_minutes * 60))
);
create index study_plan_items_plan_idx on public.study_plan_items(plan_id,user_id);
create index study_plan_items_goal_topic_idx on public.study_plan_items(goal_id,topic_id,user_id);
create index study_plan_items_topic_idx on public.study_plan_items(topic_id,goal_id,user_id);
create index study_plan_items_user_start_idx on public.study_plan_items(user_id,scheduled_start);

create table public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_item_id uuid,
  goal_id uuid not null,
  topic_id uuid,
  method_code text references public.study_methods(code),
  started_at timestamptz,
  ended_at timestamptz,
  -- Numeric preserves partial minutes from timers; never round to the UI block size.
  actual_minutes numeric(10,4) not null check (actual_minutes >= 0 and actual_minutes < 1000000),
  completion_status text not null check (completion_status in ('completed','partial','abandoned')),
  mastery_before smallint check (mastery_before between 1 and 5),
  mastery_after smallint check (mastery_after between 1 and 5),
  source text not null default 'manual' check (source in ('timer','manual','import')),
  metadata jsonb not null default '{"schema_version":1}' check (public.p0_valid_metadata(metadata)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,user_id),
  foreign key (goal_id,user_id) references public.learning_goals(id,user_id) deferrable initially immediate,
  foreign key (topic_id,goal_id,user_id) references public.goal_topics(id,goal_id,user_id) deferrable initially immediate,
  foreign key (plan_item_id,goal_id,user_id) references public.study_plan_items(id,goal_id,user_id) deferrable initially immediate,
  check (ended_at is null or (started_at is not null and ended_at >= started_at)),
  check (source <> 'timer' or (started_at is not null and ended_at is not null)),
  check (ended_at is null or actual_minutes <= round(extract(epoch from (ended_at - started_at)) / 60, 4))
);
create index study_sessions_user_start_idx on public.study_sessions(user_id,started_at);
create index study_sessions_topic_start_idx on public.study_sessions(topic_id,goal_id,user_id,started_at);
create index study_sessions_goal_idx on public.study_sessions(goal_id,user_id);
create index study_sessions_plan_item_idx on public.study_sessions(plan_item_id,goal_id,user_id);

do $$
declare t text;
begin
  foreach t in array array['study_plans','study_plan_items','study_sessions'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public, anon, authenticated',t);
    execute format('grant select, insert, update, delete on public.%I to authenticated',t);
    execute format('grant all on public.%I to service_role',t);
    execute format('create policy own_rows on public.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',t);
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()',t || '_updated_at',t);
  end loop;
end;
$$;
comment on table public.study_plans is 'P0 manual/imported plans. P1 adds coaching_run_id together with its FK when coaching_runs exists.';
comment on column public.study_plans.idempotency_key is 'Optional request key, unique per user; callers must supply a stable key to deduplicate writes.';
comment on column public.study_sessions.actual_minutes is 'Actual active minutes, independent of planned_minutes. Pauses may make this shorter than elapsed time.';
commit;
