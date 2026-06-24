const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";

interface DriveFile {
  id: string;
  name: string;
  webViewLink?: string;
  mimeType: string;
}

async function driveRequest(
  path: string,
  accessToken: string,
  options: RequestInit = {}
): Promise<Response> {
  return fetch(`${DRIVE_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
}

async function createFolder(
  name: string,
  parentId: string | null,
  accessToken: string
): Promise<DriveFile> {
  const body: Record<string, unknown> = {
    name,
    mimeType: "application/vnd.google-apps.folder",
  };
  if (parentId) body.parents = [parentId];

  const res = await driveRequest("/files?fields=id,name,webViewLink", accessToken, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return res.json();
}

async function findFolder(
  name: string,
  parentId: string | null,
  accessToken: string
): Promise<DriveFile | null> {
  const q = parentId
    ? `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`
    : `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;

  const res = await driveRequest(
    `/files?q=${encodeURIComponent(q)}&fields=files(id,name,webViewLink)`,
    accessToken
  );
  const data = await res.json();
  return data.files?.[0] ?? null;
}

async function getOrCreateFolder(
  name: string,
  parentId: string | null,
  accessToken: string
): Promise<DriveFile> {
  const existing = await findFolder(name, parentId, accessToken);
  if (existing) return existing;
  return createFolder(name, parentId, accessToken);
}

/**
 * 최초 로그인 시 Google Drive에 UniLink 폴더 구조 생성
 * /UniLink/{semester}/{courseName}/{raw, summary, plan}
 */
export async function initializeDriveFolders(
  accessToken: string,
  semester: string,
  courseName: string
): Promise<{
  rootId: string;
  semesterId: string;
  courseId: string;
  rawId: string;
  summaryId: string;
  planId: string;
}> {
  const root = await getOrCreateFolder("UniLink", null, accessToken);
  const sem = await getOrCreateFolder(semester, root.id, accessToken);
  const course = await getOrCreateFolder(courseName, sem.id, accessToken);
  const raw = await getOrCreateFolder("raw", course.id, accessToken);
  const summary = await getOrCreateFolder("summary", course.id, accessToken);
  const plan = await getOrCreateFolder("plan", course.id, accessToken);

  return {
    rootId: root.id,
    semesterId: sem.id,
    courseId: course.id,
    rawId: raw.id,
    summaryId: summary.id,
    planId: plan.id,
  };
}

/**
 * 정리본(마크다운/텍스트)을 Drive summary 폴더에 저장
 */
export async function saveSummaryToDrive(
  accessToken: string,
  summaryFolderId: string,
  content: string,
  filename: string
): Promise<DriveFile> {
  const metadata = {
    name: filename,
    parents: [summaryFolderId],
    mimeType: "text/plain",
  };

  const form = new FormData();
  form.append(
    "metadata",
    new Blob([JSON.stringify(metadata)], { type: "application/json" })
  );
  form.append("file", new Blob([content], { type: "text/plain" }));

  const res = await fetch(
    `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,name,webViewLink`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    }
  );
  return res.json();
}

/**
 * summary 폴더의 파일 목록 조회
 */
export async function listSummaries(
  accessToken: string,
  summaryFolderId: string
): Promise<DriveFile[]> {
  const q = `'${summaryFolderId}' in parents and trashed=false`;
  const res = await driveRequest(
    `/files?q=${encodeURIComponent(q)}&fields=files(id,name,webViewLink,mimeType)&orderBy=createdTime desc`,
    accessToken
  );
  const data = await res.json();
  return data.files ?? [];
}
