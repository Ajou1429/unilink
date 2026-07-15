# Google Drive Notes Integration

UniLink의 `나의 노트`는 GoodNotes 자동 백업 PDF가 Google Drive에서 변경되는 흐름을 받을 수 있도록 클라이언트 데이터 구조를 준비해 둔다.

## Target Flow

1. 사용자가 GoodNotes에서 필기하거나 수정한다.
2. GoodNotes 자동 백업이 Google Drive의 PDF 사본을 갱신한다.
3. Google Drive 변경 알림이 UniLink 서버 webhook으로 들어온다.
4. UniLink 서버가 Drive Changes API로 변경 파일을 조회한다.
5. 변경된 PDF를 다운로드하고, 이전 버전과 비교해 변경 내용을 요약한다.
6. 서버가 `GoodNotesDriveFile` 형태로 노트 upsert를 수행한다.
7. 같은 `driveFileId`는 기존 노트를 덮어쓰고, 새 `driveFileId`는 새 노트로 추가한다.
8. 사용자가 지정한 `내 수업` 또는 `개인 학습` 분류는 유지된다.

## Client Upsert Contract

Current client-side model:

```ts
interface GoodNotesDriveFile {
  driveFileId: string;
  fileName: string;
  modifiedTime: string;
  size: number;
  contentSummary: string;
}
```

The frontend helper is:

```ts
upsertGoodNotesDriveFiles(files: GoodNotesDriveFile[])
```

Behavior:

- If a note has the same `driveFileId`, update that note in place.
- If no note matches the `driveFileId`, create a new note using the Google Drive file name.
- Existing `linkedType`, `linkedId`, and `linkedTitle` stay unchanged on updates.
- New notes start as `unassigned` until the user classifies them.

## Required Server APIs

When UniLink moves from GitHub Pages to a server deployment, add these endpoints:

- `GET /api/google/auth/start`
  - Redirects the user to Google OAuth consent.
- `GET /api/google/auth/callback`
  - Exchanges OAuth code for tokens.
  - Stores refresh token securely.
- `POST /api/google/drive/watch`
  - Registers a Google Drive push notification channel.
- `POST /api/google/drive/webhook`
  - Receives Google Drive change notifications.
  - Uses stored refresh token to call Drive API.
  - Downloads changed PDF files.
  - Produces `GoodNotesDriveFile[]`.
  - Persists notes in the real database.
- `GET /api/notes`
  - Returns notes for the current user.
- `PATCH /api/notes/:id/classification`
  - Updates `linkedType`, `linkedId`, and `linkedTitle`.

## Environment Variables

Recommended variables for server deployment:

```text
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=
GOOGLE_DRIVE_WEBHOOK_URL=
GOOGLE_DRIVE_WEBHOOK_TOKEN=
DATABASE_URL=
```

## Deployment Note

GitHub Pages cannot run these APIs because it only serves static files. Use a server-capable deployment such as Vercel, Supabase Edge Functions, Render, or Fly.io for the Google Drive integration layer.
