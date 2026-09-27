-- P0: identity-owned learning data. Existing notes/Drive/Problem Bank are retained.
begin;

create function public.p0_valid_metadata(value jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(jsonb_typeof(value) = 'object'
    and jsonb_typeof(value -> 'schema_version') = 'number'
    and (value ->> 'schema_version') ~ '^[1-9][0-9]*$', false)
$$;
revoke all on function public.p0_valid_metadata(jsonb) from public, anon;
grant execute on function public.p0_valid_metadata(jsonb) to authenticated, service_role;

create table public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  timezone text not null default 'Asia/Seoul' check (length(btrim(timezone)) > 0),
  default_block_minutes smallint not null default 30 check (default_block_minutes between 5 and 180),
  preferred_session_minutes smallint check (preferred_session_minutes > 0),
  min_break_minutes smallint not null default 10 check (min_break_minutes >= 0),
  default_travel_buffer_minutes smallint not null default 0 check (default_travel_buffer_minutes >= 0),
  latest_study_end_time time,
  coaching_style text,
  metadata jsonb not null default '{"schema_version":1}' check (public.p0_valid_metadata(metadata)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create function public.p0_check_timezone()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'Unknown timezone' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.p0_check_timezone() from public, anon, authenticated;
create trigger user_preferences_timezone before insert or update of timezone
  on public.user_preferences for each row execute function public.p0_check_timezone();

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  term text not null check (length(btrim(term)) > 0),
  professor text,
  credits numeric(5,2) check (credits > 0 and credits <= 999.99),
  course_type text,
  catalog_source text,
  catalog_subject_id text,
  course_code text,
  registration_number text check (length(btrim(registration_number)) > 0),
  location text,
  status text not null default 'active' check (status in ('active','completed','archived')),
  metadata jsonb not null default '{"schema_version":1}' check (public.p0_valid_metadata(metadata)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create unique index courses_registration_unique on public.courses(user_id, term, registration_number)
  where registration_number is not null;
create index courses_user_status_idx on public.courses(user_id, status);
create index courses_user_term_idx on public.courses(user_id, term);

create table public.course_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  location text,
  effective_from date,
  effective_to date,
  metadata jsonb not null default '{"schema_version":1}' check (public.p0_valid_metadata(metadata)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (course_id,user_id) references public.courses(id,user_id) on delete cascade,
  check (start_time < end_time),
  check (effective_from is null or effective_to is null or effective_from <= effective_to),
  unique nulls not distinct (course_id, day_of_week, start_time, end_time, effective_from, effective_to)
);
create index course_schedules_user_day_idx on public.course_schedules(user_id, day_of_week);

create table public.learning_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_type text not null check (goal_type in ('course','certification','personal')),
  title text not null check (length(btrim(title)) > 0),
  course_id uuid,
  target_date date,
  importance smallint not null default 3 check (importance between 1 and 5),
  status text not null default 'active' check (status in ('active','completed','cancelled','archived')),
  completed_at timestamptz,
  metadata jsonb not null default '{"schema_version":1}' check (public.p0_valid_metadata(metadata)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,user_id),
  foreign key (course_id,user_id) references public.courses(id,user_id) deferrable initially immediate,
  check ((goal_type = 'course') = (course_id is not null)),
  check (status <> 'completed' or completed_at is not null)
);
create unique index learning_goals_course_unique on public.learning_goals(user_id,course_id) where course_id is not null;
create index learning_goals_user_status_idx on public.learning_goals(user_id,status);
create index learning_goals_user_target_idx on public.learning_goals(user_id,target_date);

create table public.goal_topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid not null,
  parent_topic_id uuid,
  depth smallint not null default 1 check (depth between 1 and 3),
  -- Enforcing a strictly decreasing depth on every parent edge also prevents cycles.
  parent_depth smallint generated always as ((depth - 1)::smallint) stored,
  title text not null check (length(btrim(title)) > 0),
  position integer check (position >= 0),
  status text not null default 'confirmed' check (status in ('candidate','confirmed','archived')),
  source_type text check (source_type in ('material_analysis','user','problem','external')),
  metadata jsonb not null default '{"schema_version":1}' check (public.p0_valid_metadata(metadata)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,user_id),
  unique (id,goal_id,user_id),
  unique (id,goal_id,user_id,depth),
  foreign key (goal_id,user_id) references public.learning_goals(id,user_id) deferrable initially immediate,
  foreign key (parent_topic_id,goal_id,user_id,parent_depth)
    references public.goal_topics(id,goal_id,user_id,depth) deferrable initially immediate,
  check ((parent_topic_id is null and depth = 1) or (parent_topic_id is not null and depth > 1)),
  check (parent_topic_id is distinct from id)
);
create index goal_topics_user_goal_idx on public.goal_topics(user_id,goal_id);
create index goal_topics_parent_idx on public.goal_topics(parent_topic_id,goal_id,user_id,parent_depth);

create table public.study_methods (
  code text primary key check (code ~ '^[a-z][a-z0-9_]*$'),
  category text not null check (length(btrim(category)) > 0),
  display_name text not null check (length(btrim(display_name)) > 0),
  description text,
  active boolean not null default true,
  metadata jsonb not null default '{"schema_version":1}' check (public.p0_valid_metadata(metadata)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.study_methods(code,category,display_name) values
  ('concept_review','review',U&'\AC1C\B150 \BCF5\C2B5'),
  ('note_review','review',U&'\B178\D2B8 \BCF5\C2B5'),
  ('basic_practice','practice',U&'\AE30\BCF8 \BB38\C81C\D480\C774'),
  ('advanced_practice','practice',U&'\C2EC\D654 \BB38\C81C\D480\C774'),
  ('wrong_answer_review','review',U&'\C624\B2F5 \BCF5\C2B5'),
  ('spaced_review','review',U&'\AC04\ACA9 \BCF5\C2B5'),
  ('mock_test','assessment',U&'\BAA8\C758\ACE0\C0AC'),
  ('assignment_work','assignment',U&'\ACFC\C81C'),
  ('project_work','project',U&'\D504\B85C\C81D\D2B8');
alter table public.study_methods enable row level security;
revoke all on public.study_methods from public,anon,authenticated;
grant select on public.study_methods to authenticated;
grant all on public.study_methods to service_role;
create policy study_methods_read on public.study_methods for select to authenticated using (true);
create trigger study_methods_updated_at before update on public.study_methods
  for each row execute function public.set_updated_at();

do $$
declare t text;
begin
  foreach t in array array['user_preferences','courses','course_schedules','learning_goals','goal_topics'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public, anon, authenticated',t);
    execute format('grant select, insert, update, delete on public.%I to authenticated',t);
    execute format('grant all on public.%I to service_role',t);
    execute format('create policy own_rows on public.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',t);
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()',t || '_updated_at',t);
  end loop;
end;
$$;
comment on column public.learning_goals.target_date is 'Representative goal deadline; individual exams/assignments belong in calendar_events. No automatic completion.';
comment on column public.course_schedules.day_of_week is 'ISO-like numeric mapping: 0 Sunday, 1 Monday, ... 6 Saturday. Split overnight slots at midnight.';
comment on table public.study_methods is 'Shared lookup; policy hypotheses such as minimum duration are not hard DB constraints.';
commit;
