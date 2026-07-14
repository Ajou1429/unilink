# Supabase 로그인 연결

UniLink 로그인/회원가입은 환경변수가 있으면 Supabase Auth를 사용하고, 없으면 기존 로컬 데모 저장소를 사용합니다.

## 필요한 GitHub Secrets

GitHub 저장소의 `Settings > Secrets and variables > Actions > New repository secret`에 아래 값을 추가합니다.

- `NEXT_PUBLIC_SUPABASE_URL`: Supabase Project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase anon public key

`service_role` 키는 브라우저와 GitHub Pages 빌드에 넣지 않습니다. Google Drive 동기화 서버나 Edge Function처럼 서버에서만 사용해야 합니다.

## Auth 설정

현재 화면은 아이디/비밀번호 방식입니다. Supabase Auth는 이메일 기반 password auth를 사용하므로 내부적으로 아래처럼 변환합니다.

```text
아이디 -> 아이디@users.unilink.app
```

이메일 인증을 아직 쓰지 않는 데모라면 Supabase Dashboard의 Auth 설정에서 이메일 확인을 끄는 편이 좋습니다. 이메일 인증을 켜두면 `users.unilink.app` 주소로 확인 메일이 가기 때문에 실제 로그인 흐름이 막힐 수 있습니다.

## 선택: profiles 테이블

회원가입 시 대학교, 학과, 생일은 Auth metadata에 저장됩니다. 아래 `profiles` 테이블이 있으면 같은 정보가 DB에도 저장됩니다.

```sql
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  university text not null,
  department text not null,
  birthday date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own"
on public.profiles
for select
using (auth.uid() = id);

create policy "profiles_insert_own"
on public.profiles
for insert
with check (auth.uid() = id);

create policy "profiles_update_own"
on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);
```

## Google Drive 연동과의 관계

같은 Supabase 프로젝트를 써도 됩니다. 다만 역할은 분리합니다.

- 프론트 로그인: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Drive 변경 감지/파일 다운로드/분석: 서버 또는 Supabase Edge Function, 필요하면 `service_role`
- 노트/수업별 파일 DB: 사용자별 RLS가 적용된 테이블

이렇게 나누면 데모 사이트 로그인은 GitHub Pages에서도 작동하고, GoodNotes/Google Drive 자동 동기화는 실제 서버 배포 후 같은 사용자 계정 기준으로 연결할 수 있습니다.
