-- UniLink Supabase 스키마
-- Supabase Dashboard → SQL Editor에서 실행

-- 사용자 프로필 (auth.users와 연결)
create table if not exists profiles (
  id          uuid references auth.users on delete cascade primary key,
  name        text,
  university  text,
  major       text,
  -- Google Drive 토큰 (암호화 보관 권장)
  google_access_token   text,
  google_refresh_token  text,
  drive_root_folder_id  text,
  created_at  timestamptz default now()
);

alter table profiles enable row level security;
create policy "본인 프로필만 접근" on profiles
  for all using (auth.uid() = id);

-- 수업 (강의 등록)
create table if not exists courses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references profiles(id) on delete cascade,
  name        text not null,
  professor   text,
  location    text,
  color       text default '#4F46E5',
  days        text[],            -- ['월', '화']
  start_time  text,              -- "09:00"
  end_time    text,              -- "10:30"
  credits     integer default 3,
  semester    text not null,     -- "2026-1"
  created_at  timestamptz default now()
);

alter table courses enable row level security;
create policy "본인 수업만 접근" on courses
  for all using (auth.uid() = user_id);

-- 수업 세션 (수업 1회 단위)
create table if not exists lecture_sessions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references profiles(id) on delete cascade,
  course_id         uuid references courses(id) on delete cascade,
  week              integer not null,
  date              date not null,
  slide_text        text default '',     -- 슬라이드 추출 텍스트
  highlighted_text  text default '',     -- 형광펜 강조 내용
  extra_notes       text default '',     -- 추가 여백 필기
  status            text default 'pending', -- pending|processing|done|error
  drive_raw_url     text,
  drive_summary_url text,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

alter table lecture_sessions enable row level security;
create policy "본인 세션만 접근" on lecture_sessions
  for all using (auth.uid() = user_id);

-- AI 분석 결과 (5종 정리본)
create table if not exists session_analyses (
  id                      uuid primary key default gen_random_uuid(),
  session_id              uuid references lecture_sessions(id) on delete cascade unique,
  progress_summary        text,   -- ① 진도 정리
  concept_summary         text,   -- ② 추가 개념 정리
  comprehension_score     integer, -- ③ 이해도 점수 (0-100)
  comprehension_notes     text,   -- ③ 이해도 분석
  teacher_emphasis        text,   -- ④ 교수 강조 내용
  note_summary            text,   -- ⑤ 추가 필기 정리
  study_plan_suggestion   text,   -- 복습 권장 계획
  drive_url               text,
  created_at              timestamptz default now()
);

alter table session_analyses enable row level security;
create policy "본인 분석만 접근" on session_analyses
  for all using (
    exists (
      select 1 from lecture_sessions ls
      where ls.id = session_analyses.session_id
        and ls.user_id = auth.uid()
    )
  );

-- Drive 폴더 메타데이터 캐시
create table if not exists drive_folders (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references profiles(id) on delete cascade,
  semester        text not null,
  course_name     text not null,
  raw_folder_id   text,
  summary_folder_id text,
  plan_folder_id  text,
  created_at      timestamptz default now(),
  unique(user_id, semester, course_name)
);

alter table drive_folders enable row level security;
create policy "본인 폴더만 접근" on drive_folders
  for all using (auth.uid() = user_id);

-- 최초 로그인 시 프로필 자동 생성
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email)
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();
