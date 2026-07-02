# Google Drive 연동 구현 가이드

> **최종 채택 경로는 이 문서가 아니라 [roadmap-drive-goodnotes-supabase.md](roadmap-drive-goodnotes-supabase.md)입니다.**
> 아래 "0. 배포 방식 전환"과 "4. 서버 API 구현"은 Next.js Route Handler(`/api/**`) 기준인데,
> 실제 구현은 GitHub Pages 정적 배포를 유지하면서 **Supabase Edge Functions**로 대체했습니다
> (`supabase/functions/google-auth`, `drive-watch`, `drive-webhook`, `drive-sync`, `drive-disconnect`,
> `drive-renew-channels`). Google Cloud 설정(1장)과 보안 체크리스트(6장)는 여전히 유효하므로 참고하되,
> 서버 구현/배포 부분은 로드맵 문서의 "구현 현황"과 "남은 수동 설정"을 따르세요.

`docs/google-drive-notes-integration.md`에 정의된 목표 아키텍처를 실제로 구현하기 위한 단계별 가이드입니다.
현재 [notes/page.tsx](../src/app/(dashboard)/notes/page.tsx)와 [my-notes-storage.ts](../src/lib/my-notes-storage.ts)는
localStorage 기반 목업(mock)이며, 실제 Google Drive API 호출이 전혀 없는 상태입니다. 이 문서는 목업을 실제 연동으로
바꾸는 순서를 정리합니다.

## 0. 선행 조건: 배포 방식 전환

`next.config.ts`가 `output: "export"`(GitHub Pages 정적 배포)로 설정돼 있습니다. 정적 export는
Route Handler(`app/api/**/route.ts`)를 빌드 타임에 실행할 서버가 없으므로 **서버 API가 필요한 이 기능과 양립하지 않습니다.**

- [ ] `output: "export"` 제거 (또는 이 기능만 별도 서버 배포로 분리)
- [ ] Vercel / Render / Fly.io 등 Node 런타임을 지원하는 배포처 선정
- [ ] `.github/workflows/deploy.yml`을 새 배포 방식에 맞게 수정 (또는 유지하며 병행 배포)

이 프로젝트의 Next.js는 16.2.9로, 학습 데이터의 관행과 다를 수 있는 breaking change가 있을 수 있습니다.
Route Handler를 작성하기 전에 `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`를 확인하세요
(AGENTS.md 지침).

## 1. Google Cloud 설정

- [ ] Google Cloud Console에서 프로젝트 생성
- [ ] **Google Drive API** 활성화 (과금 없음, 할당량만 존재)
- [ ] OAuth 동의 화면(consent screen) 구성 — 범위(scope): `https://www.googleapis.com/auth/drive.readonly` (읽기 전용이면 충분, 파일 목록/다운로드만 필요)
- [ ] OAuth 클라이언트 ID 생성 (웹 애플리케이션 유형), 승인된 리디렉션 URI에 `GOOGLE_REDIRECT_URI` 등록
- [ ] 테스트 사용자 등록 (앱이 "게시됨" 상태 전까지는 등록된 테스트 계정만 로그인 가능)

## 2. 환경 변수

`docs/google-drive-notes-integration.md`에 명시된 값을 실제로 채웁니다.

```text
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://<domain>/api/google/auth/callback
GOOGLE_DRIVE_WEBHOOK_URL=https://<domain>/api/google/drive/webhook
GOOGLE_DRIVE_WEBHOOK_TOKEN=<임의의 랜덤 시크릿, webhook 검증용>
DATABASE_URL=
```

- [ ] `.env.local`에 추가 (커밋 금지, `.gitignore` 확인)
- [ ] 배포처(Vercel 등) 환경 변수에도 동일하게 등록

## 3. 데이터베이스 스키마

현재 `MyNote`, `GoodNotesDriveFile` 타입은 클라이언트 전용입니다. 서버가 refresh token과 노트를 영속화할 테이블이 필요합니다.

- [ ] `users` (또는 기존 인증 테이블에 컬럼 추가): `google_refresh_token`, `google_drive_channel_id`, `google_drive_resource_id`, `google_drive_channel_expiration`
- [ ] `notes` 테이블: [my-notes-storage.ts](../src/lib/my-notes-storage.ts)의 `MyNote` 필드와 1:1 대응 (`driveFileId`에 유니크 인덱스 — upsert 키)
- [ ] Prisma/Drizzle 등 이미 쓰는 ORM이 있으면 그에 맞춰 마이그레이션 작성 (없다면 가벼운 것 선택 필요)

## 4. 서버 API 구현 순서

`docs/google-drive-notes-integration.md`의 "Required Server APIs" 순서대로 구현하되, 아래 순서로 진행하면 중간에도 테스트 가능합니다.

1. **`GET /api/google/auth/start`**
   - [ ] `state` 파라미터에 CSRF 방지용 랜덤 값 생성 후 세션/쿠키에 저장
   - [ ] Google OAuth 동의 화면으로 redirect (`access_type=offline`, `prompt=consent` 필수 — 그래야 refresh token 발급됨)

2. **`GET /api/google/auth/callback`**
   - [ ] `state` 값 검증
   - [ ] `code`를 토큰으로 교환
   - [ ] `refresh_token`을 DB에 암호화 저장 (평문 저장 금지)
   - [ ] 여기서 받은 access token으로 최초 `POST /api/google/drive/watch` 자동 호출

3. **`POST /api/google/drive/watch`**
   - [ ] Drive `changes.watch` 또는 `files.watch` 호출로 push notification channel 등록
   - [ ] 채널은 최대 7일까지만 유효 — **만료 전 재등록하는 크론/스케줄러 필요** (예: Vercel Cron)
   - [ ] `channel id`, `resource id`, `expiration`을 DB에 저장

4. **`POST /api/google/drive/webhook`**
   - [ ] 요청 헤더의 `X-Goog-Channel-Token`이 `GOOGLE_DRIVE_WEBHOOK_TOKEN`과 일치하는지 검증 (스푸핑 방지)
   - [ ] 헤더에 실제 변경 내용이 없으므로, 알림 수신 후 `changes.list`(저장된 `pageToken` 기준)로 실제 변경분 조회
   - [ ] 변경된 파일 중 GoodNotes PDF만 필터링 (파일명 패턴 또는 특정 폴더 ID로 제한 권장)
   - [ ] 변경 PDF 다운로드 (`files.get?alt=media`)
   - [ ] 이전 버전과 비교해 `contentSummary` 생성 (텍스트 diff 또는 OCR/요약 — 범위에 따라 별도 작업)
   - [ ] `GoodNotesDriveFile[]` 형태로 정리 후 DB upsert (기존 `upsertGoodNotesDriveFiles` 로직을 서버 버전으로 이식)
   - [ ] 응답은 최대한 빠르게 200 반환 (Google이 짧은 타임아웃으로 재시도함 — 무거운 처리는 큐/백그라운드 잡으로 분리 권장)

5. **`GET /api/notes`**, **`PATCH /api/notes/:id/classification`**
   - [ ] 인증된 사용자 기준으로 DB 조회/수정
   - [ ] 프론트엔드 [my-notes-storage.ts](../src/lib/my-notes-storage.ts)를 localStorage 대신 이 API를 호출하도록 교체

## 5. 프론트엔드 전환

- [ ] `getMyNotes`/`saveMyNotes`를 `fetch("/api/notes")` 기반으로 교체 (기존 함수 시그니처는 최대한 유지해 호출부 변경 최소화)
- [ ] [notes/page.tsx](../src/app/(dashboard)/notes/page.tsx)의 `refreshSync()`에서 하드코딩된 mock 데이터 제거 — 실제로는 서버가 webhook으로 이미 갱신하므로, 버튼은 "마지막 동기화 상태 다시 불러오기" 정도로 축소하거나 완전히 제거
- [ ] "필기앱 연동" 카드의 "준비됨" 배지를 실제 연동 상태(OAuth 연결 여부)에 따라 표시하도록 변경
- [ ] Drive 계정 연결/해제 버튼 추가 (`/api/google/auth/start`로 이동, 연결 해제 시 refresh token 폐기 + DB 삭제)

## 6. 보안 체크리스트

- [ ] refresh token은 저장 전 암호화 (KMS 또는 최소한 대칭키 암호화)
- [ ] webhook 엔드포인트는 토큰 검증 없이는 어떤 DB 쓰기도 하지 않도록
- [ ] OAuth `state` 검증 없이는 callback 처리 금지 (CSRF 방지)
- [ ] Drive 접근 범위는 `drive.readonly`로 최소화 (쓰기 권한 불필요)
- [ ] 사용자별로 자신의 노트만 조회/수정 가능하도록 서버에서 소유권 검증

## 7. 검증 순서 (실 사용자 승인 전 반드시 확인)

1. [ ] 로컬에서 ngrok 등으로 webhook URL을 임시 공개 → OAuth 연결 → 실제 GoodNotes 앱에서 파일 수정 → webhook 수신 확인
2. [ ] 동일 `driveFileId` 재수정 시 노트가 새로 생기지 않고 덮어써지는지 확인
3. [ ] 새 PDF 추가 시 "미분류"로 새 노트가 생성되는지 확인
4. [ ] channel 만료(7일) 후 재등록 크론이 정상 동작하는지 확인
5. [ ] `docs/google-drive-notes-integration.md`에 실제 구현과 달라진 부분이 있으면 문서 업데이트
