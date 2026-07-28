-- 문제은행(problembank) 통합: PDF 문제은행 업로드 -> 문제 단위 추출 -> 0-5 이해도 트래킹
-- 원본: Ajou1429/problembank (Node/Express + SQLite 개인용 도구)를 UniLink의
-- Supabase 구조(사용자별 RLS)로 포팅. public.set_updated_at()은 0001에서 정의됨.

create table if not exists public.problem_bank_subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create index if not exists problem_bank_subjects_user_id_idx
  on public.problem_bank_subjects (user_id);

alter table public.problem_bank_subjects enable row level security;

drop policy if exists "problem_bank_subjects_select_own" on public.problem_bank_subjects;
create policy "problem_bank_subjects_select_own" on public.problem_bank_subjects
  for select using (auth.uid() = user_id);

drop policy if exists "problem_bank_subjects_insert_own" on public.problem_bank_subjects;
create policy "problem_bank_subjects_insert_own" on public.problem_bank_subjects
  for insert with check (auth.uid() = user_id);

drop policy if exists "problem_bank_subjects_update_own" on public.problem_bank_subjects;
create policy "problem_bank_subjects_update_own" on public.problem_bank_subjects
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "problem_bank_subjects_delete_own" on public.problem_bank_subjects;
create policy "problem_bank_subjects_delete_own" on public.problem_bank_subjects
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- problem_bank_problems
-- ---------------------------------------------------------------------------
create table if not exists public.problem_bank_problems (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.problem_bank_subjects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  level integer not null default 0 check (level between 0 and 5),
  source_file text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subject_id, label)
);

create index if not exists problem_bank_problems_user_id_idx
  on public.problem_bank_problems (user_id);

create index if not exists problem_bank_problems_subject_id_idx
  on public.problem_bank_problems (subject_id);

drop trigger if exists problem_bank_problems_set_updated_at on public.problem_bank_problems;
create trigger problem_bank_problems_set_updated_at
  before update on public.problem_bank_problems
  for each row
  execute function public.set_updated_at();

alter table public.problem_bank_problems enable row level security;

drop policy if exists "problem_bank_problems_select_own" on public.problem_bank_problems;
create policy "problem_bank_problems_select_own" on public.problem_bank_problems
  for select using (auth.uid() = user_id);

drop policy if exists "problem_bank_problems_insert_own" on public.problem_bank_problems;
create policy "problem_bank_problems_insert_own" on public.problem_bank_problems
  for insert with check (auth.uid() = user_id);

drop policy if exists "problem_bank_problems_update_own" on public.problem_bank_problems;
create policy "problem_bank_problems_update_own" on public.problem_bank_problems
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "problem_bank_problems_delete_own" on public.problem_bank_problems;
create policy "problem_bank_problems_delete_own" on public.problem_bank_problems
  for delete using (auth.uid() = user_id);
