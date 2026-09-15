# 보안 보완 내역과 배포 절차

이 변경은 로컬 코드와 마이그레이션을 보완한다. 운영 Supabase의 설정·스키마·함수 배포 상태까지 자동으로 변경하지 않는다.

## 반영한 방어

- Google Drive 연결: 시작한 탭의 `sessionStorage`에만 임의 검증값을 보관하고, SHA-256 챌린지를 OAuth state와 함께 서버에 저장한다. 콜백은 고정된 프론트엔드 주소의 fragment로 응답을 전달한다. 인증된 `/complete`에서 사용자·챌린지·10분 유효기간을 확인하고 state를 원자적으로 소비한 뒤 PKCE 코드 교환을 한다. 다른 계정/탭, 만료, 재사용 요청을 거부한다. 새 Google 계정을 연결할 때 이전 폴더와 동기화 커서를 초기화한다.
- 계정 데이터: 서버에서 세션을 확인한 뒤 화면을 열고 계정 변경 시 화면 상태를 다시 만든다. 저장 키는 계정별로 분리하며 로그아웃한 데모는 탭의 `sessionStorage`를 사용한다. 사이드바 로그아웃은 실제 Supabase 세션을 종료한다. 캐시된 사용자 JSON은 인증 근거로 사용하지 않는다.
- 데모 인증: 브라우저에서 비밀번호를 해시·저장하던 가입/로그인을 제거한다. Supabase 미설정 상태에서는 계정 가입/로그인을 비활성화한다. 새 가입 비밀번호 최소 길이는 12자다.
- 문제은행: RLS와 `(subject_id, user_id)` 복합 외래 키로 과목 소유권을 검증한다. Drive 연결 정보는 표시용 컬럼만 클라이언트에서 조회할 수 있고 토큰 암호문·IV는 서버만 읽는다.
- PDF 분석: 스트림을 읽는 동안 20MiB + multipart 오버헤드 64KiB를 제한하고 실제 파일은 20MiB, 50페이지까지 허용한다. PDF MIME/시그니처, AI 출력 구조·개수(최대 1,000개), 출력 바이트(1MiB), 출력 토큰을 검증/제한한다. 네트워크/본문 작업에는 120초 취소 신호를 사용한다.
- 분석 예산: PostgreSQL 잠금과 서버 전용 예약 함수로 사용자당 rolling 24시간 5회, 전체 100회, 사용자당 동시 1개, 전체 동시 10개로 제한한다. 실패한 요청도 횟수를 소비한다. 중단된 작업의 임대는 5분 뒤 만료된다. 예산 조회 실패 시 분석을 실행하지 않는다.
- Drive 폴더 입력: ID 문자를 검증해 Drive 검색식 삽입을 차단하고 요청 JSON은 16KiB, 동기화 대상 폴더는 최대 10개로 제한한다.
- 파일 미리보기: Drive에서 접근 가능한 PDF만 최대 20MiB로 반환하고 시그니처를 재검사한다. iframe은 sandbox를 적용하고 응답은 `no-store`/`nosniff`로 반환한다. Storage 수동 업로드 버킷에는 크기 및 MIME 제한을 적용한다. HTML/SVG 업로드는 허용하지 않는다.

## 배포 순서

1. 운영 DB를 백업하고 `supabase migration list`로 적용 이력을 확인한다. `0001`~`0008`이 적용된 대상에 `supabase db push`로 `0009_security_hardening.sql`을 적용한다. 예상하지 않은 미적용 마이그레이션이 있으면 먼저 내용을 검토한다.
2. 아래의 기존 데이터 검사를 수행한다. 불일치가 있으면 관련 행을 별도 보관하고 실제 소유자를 확인한 뒤 수정한다. 마이그레이션은 기존 데이터 삭제 없이 새 쓰기부터 차단하도록 `NOT VALID` 외래 키를 사용한다.
3. `supabase functions deploy`로 함수를 배포한다. 공통 인증/응답 모듈도 변경되었으므로 모든 함수를 배포한다. 최소 필수 변경 함수는 `google-auth`, `problem-bank-upload`, `drive-file`, `drive-folders`, `drive-sync`이다.
4. 새 프론트엔드를 함께 배포한다. 이전 OAuth 프론트엔드와 새 함수는 호환되지 않으며 진행 중이던 연결은 처음부터 다시 시작해야 한다. 기존에 완료된 Google 연결은 유지된다.
5. Supabase Auth 운영 설정의 비밀번호 최소 길이를 12자로 맞춘다. `config.toml` 수정만으로 호스팅 프로젝트 설정이 바뀌지는 않는다. 가입·로그인 rate limit과 CAPTCHA, 사용 중인 플랜의 유출 비밀번호 차단 기능도 적용한다. 현재 아이디를 가상 이메일로 변환하는 가입 구조는 실제 이메일 확인/비밀번호 복구를 지원하지 않으므로, 실서비스 전 실제 이메일 또는 학교 SSO 기반 가입으로 전환해야 한다.
6. 테스트 계정 두 개로 로그인→노트/시간표 저장→로그아웃→다른 계정 로그인, Drive 동의→콜백→폴더 선택→PDF 열기, 한도 초과를 확인한다. PDF 내장 뷰어가 sandbox에서 동작하지 않는 브라우저는 다운로드를 사용한다.

```sql
-- 관리자 권한으로 기존 과목/문제 소유자 불일치 검사 (읽기 전용)
select p.id, p.subject_id, p.user_id as problem_owner, s.user_id as subject_owner
from public.problem_bank_problems p
join public.problem_bank_subjects s on s.id = p.subject_id
where p.user_id <> s.user_id;

-- 결과가 0행이거나 불일치를 해결한 뒤 실행
alter table public.problem_bank_problems
  validate constraint problem_bank_problems_subject_owner_fk;
```

`FRONTEND_URL`은 HTTPS 앱 루트여야 한다. GitHub Pages라면 `https://<owner>.github.io/unilink`처럼 basePath를 포함한다. `GOOGLE_REDIRECT_URI`는 등록된 Supabase `/functions/v1/google-auth/callback` 주소를 유지한다. `DRIVE_TOKEN_ENC_KEY`는 base64 인코딩된 32바이트 키여야 하며, 기존 암호문을 마이그레이션하지 않은 채 키를 교체하면 기존 연결을 읽을 수 없다.

## 기존 브라우저 데이터

이전 전역 `unilink:*` 데이터에는 소유자를 증명할 정보가 없으므로 새 계정으로 자동 이전하지 않는다. 원본 키는 삭제하지 않고 보존한다. 따라서 업데이트 직후 기존 시간표·성적·글이 보이지 않을 수 있다. 복구가 필요하면 본인 데이터임을 확인하고 백업한 뒤 해당 계정으로 명시적으로 가져오는 절차가 필요하다. 기존 로컬 데모 계정도 Supabase 계정으로 자동 전환하지 않는다.

계정별 키 분리는 다른 계정 화면에서의 우발적 노출을 방지한다. 브라우저 개발자 도구나 디스크 접근자에 대한 암호화는 아니다. 공용 PC에서는 로그아웃 후 필요에 따라 사이트 데이터를 삭제해야 한다. 기존 데모 비밀번호 해시는 `unilink:users`에 남아 있을 수 있으므로 필요한 데이터 백업 후 제거하고, 다른 서비스에서 같은 비밀번호를 사용했다면 변경한다.

## 검증

Node 24 이상과 Deno 2.9.6을 기준으로 실행한다.

```sh
npm ci
npm run lint -- --max-warnings 0
npm test
npm run build
npm run check:edge
npm run test:edge
npm audit
```

- Node 테스트는 기존 카탈로그/커뮤니티 회귀 검사, 계정별 저장소 격리, PGlite의 실제 PostgreSQL RLS/외래 키/컬럼 권한/사용량 예약 검사를 포함한다. PGlite는 Supabase 시스템 스키마의 최소 부분을 구성하므로 실제 호스팅 API/설정까지 검증하지는 않는다.
- Deno 테스트는 실제 OAuth 핸들러에 가짜 외부 응답을 주입해 계정/검증값/만료/재사용 방어를 확인하고 스트림·PDF·AI 출력 제한을 검사한다. 실제 Google 동의 화면과 토큰 교환은 배포 환경에서 확인해야 한다.
- `tests/ajou-picker.browser.mjs`, `tests/community.browser.mjs`, `tests/security.browser.mjs`는 Supabase 미설정 데모 환경에서 실행한다. `AJOU_TEST_URL`, `AJOU_PLAYWRIGHT_MODULE`로 서버와 Playwright 경로를 지정할 수 있다.

PR 및 main/dev 푸시 시 `.github/workflows/security-checks.yml`에서 린트, Node/PostgreSQL 회귀 검사, Edge 타입 검사와 보안 테스트를 실행한다.

## 남은 운영상 한계

PDF 라이브러리의 동기 파싱 자체는 AbortSignal로 중단되지 않는다. 조작된 PDF의 CPU/메모리 소비는 Edge 실행 한도와 입력 제한에 의존한다. 규모가 커지면 별도 작업 큐·격리된 파서·총 메모리 제한을 도입한다. 이 앱의 사용자별 예산 외에도 Gemini 프로젝트 결제/할당량 제한을 설정해야 한다. Storage는 MIME 헤더와 크기를 제한하며 악성코드 검사까지 수행하지 않는다.

프론트엔드는 정적 export이므로 서버 미들웨어 인증이나 HTTP 보안 헤더를 여기서 직접 적용할 수 없다. 비공개 데이터는 Supabase RLS가 보호하며 브라우저 화면 숨김은 서버 권한 검사를 대신하지 않는다. 운영 CSP 등 응답 헤더는 호스팅/CDN에서 구성해야 한다.
