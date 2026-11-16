-- 과목 화면에서 지운 Drive 강의자료를 다음 동기화 때 다시 가져오지 않도록 기억한다.
-- Drive 원본은 지우지 않는다. 사용자 본인 행만 읽고 쓰며, 동기화 함수(service_role)가 확인한다.
begin;

create table public.dismissed_drive_files (
  user_id uuid not null references auth.users(id) on delete cascade,
  drive_file_id text not null check (char_length(drive_file_id) between 1 and 200),
  created_at timestamptz not null default now(),
  primary key (user_id, drive_file_id)
);
alter table public.dismissed_drive_files enable row level security;
revoke all on public.dismissed_drive_files from public, anon, authenticated;
grant select, insert, update, delete on public.dismissed_drive_files to authenticated;
grant all on public.dismissed_drive_files to service_role;
create policy own_rows on public.dismissed_drive_files for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

commit;
