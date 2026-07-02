# 로드맵: GoodNotes → Google Drive → UniLink 노트 연동 (Supabase 중심, LLM 미사용)

작성일: 2026-07-02 / 구현 갱신: 2026-07-02
전제: 백엔드는 **Supabase**(Auth + Postgres + Edge Functions + pg_cron), 연동 범위는 **GoodNotes 자동 백업 PDF → Google Drive** 경로만, **LLM API는 사용하지 않음**.

## 구현 현황 (코드 기준)

코드는 모두 작성/빌드 검증(`next build`, `tsc --noEmit`) 완료. 다만 실제 Supabase 프로젝트와
Google Cloud OAuth 앱이 없으면 "개발 모드"로 동작한다(로컬 목업 fallback, 아래 참고).

- [x] Phase 1 스키마: [supabase/migrations/0001_notes_and_drive.sql](../supabase/migrations/0001_notes_and_drive.sql) — `notes`, `drive_connections`, `oauth_states`, RLS
- [x] Phase 1 클라이언트: [src/lib/supabase/client.ts](../src/lib/supabase/client.ts) — env 미설정 시 `isSupabaseConfigured=false`로 로컬 fallback
- [x] Phase 1 Auth: [login/page.tsx](../src/app/login/page.tsx), [signup/page.tsx](../src/app/signup/page.tsx) — 이메일/비밀번호 + Google OAuth (`supabase.auth.signInWithOAuth`)
- [x] Phase 2 데이터 계층: [src/lib/my-notes-storage.ts](../src/lib/my-notes-storage.ts) — `isSupabaseConfigured`에 따라 Supabase 쿼리 또는 localStorage 목업으로 분기, 함수는 모두 `Promise` 반환으로 변경(호출부 3곳 — notes/course/personal-study page — 갱신 완료)
- [x] Phase 3 OAuth 연결: [supabase/functions/google-auth](../supabase/functions/google-auth/index.ts) (`/start`, `/callback`) — refresh_token은 AES-GCM 암호화 후 저장 ([_shared/crypto.ts](../supabase/functions/_shared/crypto.ts))
- [x] Phase 3 프론트 연동 UI: [src/lib/drive-connection.ts](../src/lib/drive-connection.ts) + notes 페이지의 "필기앱 연동" 카드 (연결/해제/폴더 지정 버튼)
- [x] Phase 4 수동 pull: [supabase/functions/drive-sync](../supabase/functions/drive-sync/index.ts) — 폴더 지정 시 자동으로 `drive_connections.folder_id`에 저장 후 동기화
- [x] Phase 5 실시간 push: [supabase/functions/drive-watch](../supabase/functions/drive-watch/index.ts), [drive-webhook](../supabase/functions/drive-webhook/index.ts), [drive-renew-channels](../supabase/functions/drive-renew-channels/index.ts) + [pg_cron 마이그레이션](../supabase/migrations/0002_drive_renew_cron.sql)
- [x] 연결 해제: [supabase/functions/drive-disconnect](../supabase/functions/drive-disconnect/index.ts) — channel stop + token revoke + row 삭제
- [ ] Phase 6 품질/보안 마무리 — 아래 "남은 수동 설정" 전부 완료 후 실 계정으로 검증 필요
- [ ] OCR 기반 요약 품질 개선 (선택) — 현재는 메타데이터 기반 요약만 구현

### 남은 수동 설정 (코드로 대신할 수 없는 것)

1. Supabase 프로젝트 생성 → `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`를 `.env.local`에 설정(`.env.local.example` 참고)
2. `supabase db push` 또는 SQL Editor에서 `supabase/migrations/*.sql` 두 파일 실행 (두 번째 파일은 project-ref/CRON_SECRET 값을 실제 값으로 바꾼 뒤 실행)
3. Google Cloud Console에서 OAuth 클라이언트 생성, `docs/google-drive-integration-guide.md`의 "1. Google Cloud 설정" 그대로 따라가되 리디렉션 URI는 `https://<project-ref>.supabase.co/functions/v1/google-auth/callback`
4. Edge Function 시크릿 등록: `supabase secrets set GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... GOOGLE_REDIRECT_URI=... GOOGLE_DRIVE_WEBHOOK_URL=... GOOGLE_DRIVE_WEBHOOK_TOKEN=... DRIVE_TOKEN_ENC_KEY=... CRON_SECRET=... FRONTEND_URL=...`
5. `supabase functions deploy google-auth drive-watch drive-webhook drive-sync drive-disconnect drive-renew-channels`
6. Google OAuth 동의 화면에 테스트 사용자로 본인 계정 등록 (앱이 "게시됨" 상태 전까지 필요)
7. 위 5단계가 끝나야 `NEXT_PUBLIC_SUPABASE_*`를 설정한 배포에서 "개발 모드" 배지가 사라지고 실제 연동 UI가 보인다

## 현재 상태 진단

- 프론트: Next.js 16 + `output: "export"` 정적 빌드, GitHub Pages 배포 (`basePath: /unilink`)
- 노트 기능: [notes/page.tsx](../src/app/(dashboard)/notes/page.tsx) + [my-notes-storage.ts](../src/lib/my-notes-storage.ts) — 전부 localStorage 목업, 실제 API 호출 없음
- `@supabase/supabase-js`, `@supabase/ssr` 설치돼 있으나 **코드에서 미사용** (로그인/회원가입도 목업)
- 기존 설계 문서: [google-drive-notes-integration.md](google-drive-notes-integration.md)(목표 아키텍처), [google-drive-integration-guide.md](google-drive-integration-guide.md)(Next API Route 기준 구현 가이드)

핵심 판단: Supabase Edge Functions가 서버 역할을 대신하므로 **정적 export + GitHub Pages 배포를 그대로 유지**할 수 있다. 기존 가이드의 "0. 배포 방식 전환" 단계는 불필요해지고, `/api/**` Route Handler 대신 Edge Functions로 대체한다.

## 목표 아키텍처

```
GoodNotes 자동백업 → Google Drive (특정 폴더의 PDF)
       ↓ push notification (files/changes.watch)
Supabase Edge Function: drive-webhook
       ↓ changes.list → 변경 PDF 다운로드 → 텍스트 추출(비-LLM) → contentSummary 생성
Postgres notes 테이블 upsert (driveFileId 기준)
       ↓ supabase-js (RLS 적용)
프론트엔드 notes 페이지 (localStorage 대체)
```

contentSummary는 LLM 없이 생성한다: PDF 텍스트 레이어 추출(예: unpdf/pdf.js — Deno 호환) 후 첫 N문장 + 페이지 수/수정일 등 메타데이터. GoodNotes 백업 PDF는 손글씨라 텍스트 레이어가 없을 수 있으므로, 없으면 "페이지 12장, 3페이지 추가됨" 같은 **메타데이터 기반 요약**으로 폴백. OCR(Tesseract 등 비-LLM)은 선택 단계로 분리.

## Phase 1 — Supabase 기반 다지기 (1~2주)

- Supabase 프로젝트 생성, `.env` 구성 (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
- Supabase Auth로 로그인/회원가입 목업 대체 (이메일 + Google 소셜 로그인)
- 스키마: `notes` 테이블 — `MyNote` 필드와 1:1 매핑, `(user_id, drive_file_id)` 유니크 인덱스(upsert 키), `drive_connections` 테이블 — `user_id`, `refresh_token`(암호화), `folder_id`, `channel_id`, `resource_id`, `channel_expiration`, `page_token`
- RLS: 두 테이블 모두 `user_id = auth.uid()`만 조회/수정 가능
- 완료 기준: 로그인 후 빈 노트 목록이 DB에서 조회됨

## Phase 2 — 프론트 데이터 계층 전환 (1주)

- `my-notes-storage.ts`의 `getMyNotes`/`saveMyNotes`/`upsertGoodNotesDriveFiles`를 supabase-js 호출로 교체 (함수 시그니처 유지 → 호출부 변경 최소화)
- 노트 분류 변경(`linkedType`/`linkedId`/`linkedTitle`)을 DB update로 전환
- localStorage 목업 데이터는 개발용 fallback으로만 유지하거나 제거
- 완료 기준: 노트 CRUD가 기기 간 동기화됨

## Phase 3 — Google OAuth + Drive 연결 (1~2주)

- Google Cloud: Drive API 활성화, OAuth 클라이언트 생성, scope `drive.readonly`, 테스트 사용자 등록
- Edge Function `google-auth`: OAuth start(state 생성) / callback(code→token 교환, refresh_token 암호화 저장) — 정적 프론트에서 이 함수 URL로 리다이렉트
- 프론트: "필기앱 연동" 카드의 하드코딩된 "준비됨" 배지를 실제 연결 상태로 교체, 연결/해제 버튼 추가 (해제 시 token revoke + row 삭제)
- 사용자가 GoodNotes 백업 폴더를 선택하는 UI (Drive files.list로 폴더 목록 조회)
- 완료 기준: OAuth 연결 후 지정 폴더의 PDF 목록을 수동 조회 가능

## Phase 4 — 수동 동기화 (Pull) (1주)

webhook 전에 pull 방식 먼저 — 검증이 쉽고 webhook 장애 시 폴백이 된다.

- Edge Function `drive-sync`: 지정 폴더의 PDF를 `files.list`(modifiedTime 필터)로 조회 → 변경분 다운로드 → 텍스트 추출/메타데이터 요약 → `notes` upsert
- 기존 `upsertGoodNotesDriveFiles` 동작 계약 준수: 같은 `driveFileId`는 덮어쓰기(version+1, 분류 유지), 새 파일은 `unassigned`로 생성
- notes 페이지의 `refreshSync()` mock 제거 → 이 함수 호출로 교체
- 완료 기준: GoodNotes에서 필기 수정 → 백업 → "동기화" 버튼 → 노트 갱신

## Phase 5 — 실시간 동기화 (Push) (1~2주)

- Edge Function `drive-webhook`: `X-Goog-Channel-Token` 검증 → 저장된 `page_token`으로 `changes.list` → Phase 4 파이프라인 재사용 → 즉시 200 응답 (무거운 처리는 후속 호출/큐로 분리)
- Edge Function `drive-watch`: `changes.watch`로 채널 등록, 채널 정보 DB 저장
- pg_cron: 채널 만료(최대 7일) 전 재등록 스케줄
- 완료 기준: GoodNotes 수정 → 수 분 내 자동으로 노트 갱신 (버튼 불필요)

## Phase 6 — 품질/보안 마무리 (1주)

- refresh token 암호화 확인(Supabase Vault 또는 대칭키), webhook 토큰 검증 없이는 DB 쓰기 금지, OAuth state 검증
- 대용량 PDF 처리 한도(Edge Function 메모리/시간 제한) 확인 — 초과 시 텍스트 추출 생략하고 메타데이터 요약만
- 검증 시나리오: 동일 파일 재수정 시 중복 생성 없음 / 새 PDF는 미분류 생성 / 분류 유지 / 채널 재등록 동작
- 기존 docs 2개 문서를 Supabase 아키텍처 기준으로 업데이트
- (선택) Tesseract 기반 OCR로 손글씨 PDF 요약 품질 개선 — LLM 불필요

## 위험 요소

- **GoodNotes 백업 PDF에 텍스트 레이어가 없을 가능성 높음** → contentSummary는 메타데이터 중심으로 설계하고, 텍스트 추출은 되면 좋은 것으로 취급
- Drive push 채널 7일 만료 → pg_cron 재등록 실패 시 Phase 4의 수동 pull이 안전망
- Google OAuth 앱 "게시" 전에는 테스트 사용자만 로그인 가능 — 시연 계정 미리 등록
- Edge Function은 Deno 런타임 — Node 전용 PDF 라이브러리 불가, Deno 호환(unpdf 등)만 사용

## 기존 문서와의 차이 요약

| 항목 | 기존 가이드 | 이 로드맵 |
|---|---|---|
| 배포 | output:export 제거, Vercel 등 이전 | GitHub Pages 유지 |
| 서버 API | Next Route Handler `/api/**` | Supabase Edge Functions |
| DB | 별도 선정 (Prisma/Drizzle) | Supabase Postgres + RLS |
| 채널 재등록 | Vercel Cron | pg_cron |
| contentSummary | diff/OCR/요약 (범위 미정) | 비-LLM: 텍스트 추출 + 메타데이터, OCR 선택 |
