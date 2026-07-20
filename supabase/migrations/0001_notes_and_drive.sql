-- Phase 1: notes + drive_connections + oauth_states
-- docs/roadmap-drive-goodnotes-supabase.md 참고

create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- notes
-- ---------------------------------------------------------------------------
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  course_name text not null default '미분류',
  linked_type text not null default 'unassigned'
    check (linked_type in ('course', 'personal', 'unassigned')),
  linked_id text,
  linked_title text,
  source text not null default '직접 작성',
  sync_status text not null default 'manual'
    check (sync_status in ('synced', 'pending', 'manual')),
  content text not null default '',
  file_name text,
  file_size bigint,
  drive_file_id text,
  drive_modified_time timestamptz,
  version integer not null default 1,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 같은 사용자 안에서 같은 Drive 파일은 하나의 노트로만 upsert 되어야 함
create unique index if not exists notes_user_drive_file_unique
  on public.notes (user_id, drive_file_id)
  where drive_file_id is not null;

create index if not exists notes_user_id_idx on public.notes (user_id);

drop trigger if exists notes_set_updated_at on public.notes;
create trigger notes_set_updated_at
  before update on public.notes
  for each row
  execute function public.set_updated_at();

alter table public.notes enable row level security;

drop policy if exists "notes_select_own" on public.notes;
create policy "notes_select_own" on public.notes
  for select using (auth.uid() = user_id);

drop policy if exists "notes_insert_own" on public.notes;
create policy "notes_insert_own" on public.notes
  for insert with check (auth.uid() = user_id);

drop policy if exists "notes_update_own" on public.notes;
create policy "notes_update_own" on public.notes
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "notes_delete_own" on public.notes;
create policy "notes_delete_own" on public.notes
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- drive_connections: 사용자별 Google Drive OAuth 연결 상태
-- refresh_token은 평문 저장 금지 -> AES-GCM으로 암호화된 바이트를 저장 (see
-- supabase/functions/_shared/crypto.ts). service_role 키를 쓰는 Edge Function만
-- 이 테이블에 쓰기 접근 가능하도록 RLS를 잠근다 (아래 policy는 select만 허용).
-- ---------------------------------------------------------------------------
create table if not exists public.drive_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  refresh_token_encrypted text not null,
  refresh_token_iv text not null,
  folder_id text,
  account_email text,
  account_name text,
  account_photo_url text,
  channel_id text,
  resource_id text,
  channel_expiration timestamptz,
  page_token text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists drive_connections_set_updated_at on public.drive_connections;
create trigger drive_connections_set_updated_at
  before update on public.drive_connections
  for each row
  execute function public.set_updated_at();

alter table public.drive_connections enable row level security;

-- 프론트에서 "연결됨" 배지를 보여주기 위한 조회만 허용, 쓰기는 Edge Function
-- (service_role, RLS 우회)에서만 수행한다.
drop policy if exists "drive_connections_select_own" on public.drive_connections;
create policy "drive_connections_select_own" on public.drive_connections
  for select using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- oauth_states: OAuth CSRF state 임시 저장 (10분 뒤 만료)
-- ---------------------------------------------------------------------------
create table if not exists public.oauth_states (
  state text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.oauth_states enable row level security;
-- Edge Function은 service_role로 접근하므로 별도 select/insert policy는 두지 않는다
-- (일반 사용자는 이 테이블에 어떤 권한도 없어야 함).
