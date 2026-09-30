begin;

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid,
  event_type text not null check (event_type in ('exam','assignment','quiz','presentation','project','appointment','other')),
  title text not null check (length(btrim(title)) > 0),
  starts_at timestamptz,
  ends_at timestamptz,
  due_at timestamptz,
  is_blocking boolean not null default false,
  importance smallint check (importance between 1 and 5),
  status text not null default 'scheduled' check (status in ('scheduled','completed','cancelled')),
  metadata jsonb not null default '{"schema_version":1}' check (public.p0_valid_metadata(metadata)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,user_id),
  foreign key (goal_id,user_id) references public.learning_goals(id,user_id) deferrable initially immediate,
  check (starts_at is not null or due_at is not null),
  check (ends_at is null or (starts_at is not null and ends_at >= starts_at)),
  check (not is_blocking or (starts_at is not null and ends_at is not null and ends_at > starts_at))
);
create index calendar_events_user_due_idx on public.calendar_events(user_id,due_at);
create index calendar_events_user_start_idx on public.calendar_events(user_id,starts_at);
create index calendar_events_goal_type_idx on public.calendar_events(goal_id,user_id,event_type);

create table public.recurring_commitments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(btrim(title)) > 0),
  commitment_type text not null default 'other' check (commitment_type in ('work','appointment','other')),
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  effective_from date,
  effective_to date,
  is_blocking boolean not null default true,
  metadata jsonb not null default '{"schema_version":1}' check (public.p0_valid_metadata(metadata)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,user_id),
  check (start_time < end_time),
  check (effective_from is null or effective_to is null or effective_from <= effective_to)
);
create index recurring_commitments_user_day_idx on public.recurring_commitments(user_id,day_of_week);

create table public.course_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null,
  session_date date not null,
  started_at timestamptz,
  ended_at timestamptz,
  pace smallint check (pace between 1 and 5),
  memo text,
  metadata jsonb not null default '{"schema_version":1}' check (public.p0_valid_metadata(metadata)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,user_id),
  unique (id,course_id,user_id),
  foreign key (course_id,user_id) references public.courses(id,user_id) deferrable initially immediate,
  check (ended_at is null or (started_at is not null and ended_at >= started_at))
);
create index course_sessions_user_date_idx on public.course_sessions(user_id,session_date);
create index course_sessions_course_date_idx on public.course_sessions(course_id,user_id,session_date);

alter table public.learning_goals add constraint learning_goals_course_owner_unique unique(id,course_id,user_id);
create table public.course_session_topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  course_id uuid not null,
  goal_id uuid not null,
  topic_id uuid not null,
  emphasis smallint check (emphasis between 1 and 5),
  metadata jsonb not null default '{"schema_version":1}' check (public.p0_valid_metadata(metadata)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id,topic_id),
  foreign key (session_id,course_id,user_id) references public.course_sessions(id,course_id,user_id) on delete cascade,
  foreign key (goal_id,course_id,user_id) references public.learning_goals(id,course_id,user_id) deferrable initially immediate,
  foreign key (topic_id,goal_id,user_id) references public.goal_topics(id,goal_id,user_id) deferrable initially immediate
);
create index course_session_topics_user_idx on public.course_session_topics(user_id);
create index course_session_topics_topic_idx on public.course_session_topics(topic_id,goal_id,user_id);
create index course_session_topics_goal_idx on public.course_session_topics(goal_id,course_id,user_id);

do $$
declare t text;
begin
  foreach t in array array['calendar_events','recurring_commitments','course_sessions','course_session_topics'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public, anon, authenticated',t);
    execute format('grant select, insert, update, delete on public.%I to authenticated',t);
    execute format('grant all on public.%I to service_role',t);
    execute format('create policy own_rows on public.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',t);
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()',t || '_updated_at',t);
  end loop;
end;
$$;
comment on table public.recurring_commitments is 'One row per weekly slot; same title can have different times on different weekdays.';
comment on table public.course_session_topics is 'course_id and goal_id enforce that the topic belongs to the course taught in this session.';
commit;
