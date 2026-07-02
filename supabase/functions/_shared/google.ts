// Deno 런타임에서 googleapis 없이 fetch로 직접 Google OAuth / Drive REST API를 호출한다.

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const DRIVE_API = "https://www.googleapis.com/drive/v3";

interface GoogleEnv {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function getGoogleEnv(): GoogleEnv {
  return {
    clientId: Deno.env.get("GOOGLE_CLIENT_ID")!,
    clientSecret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
    redirectUri: Deno.env.get("GOOGLE_REDIRECT_URI")!,
  };
}

export function buildConsentUrl(state: string): string {
  const { clientId, redirectUri } = getGoogleEnv();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    scope: "https://www.googleapis.com/auth/drive.readonly",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string) {
  const { clientId, clientSecret, redirectUri } = getGoogleEnv();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    throw new Error(`Google token 교환 실패: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
    token_type: string;
  };
}

export async function refreshAccessToken(refreshToken: string) {
  const { clientId, clientSecret } = getGoogleEnv();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    throw new Error(`Google access token 갱신 실패: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as { access_token: string; expires_in: number };
}

export async function revokeToken(token: string) {
  await fetch(REVOKE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
  });
}

export async function driveFetch(
  accessToken: string,
  path: string,
  init: RequestInit = {},
) {
  const res = await fetch(`${DRIVE_API}${path}`, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!res.ok) {
    throw new Error(`Drive API 오류 (${path}): ${res.status} ${await res.text()}`);
  }
  return res;
}

export async function getStartPageToken(accessToken: string): Promise<string> {
  const res = await driveFetch(accessToken, "/changes/startPageToken");
  const data = await res.json();
  return data.startPageToken as string;
}

export interface DriveChangeFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  size?: string;
  parents?: string[];
  trashed?: boolean;
}

export async function listChanges(
  accessToken: string,
  pageToken: string,
): Promise<{ files: DriveChangeFile[]; newStartPageToken: string }> {
  const files: DriveChangeFile[] = [];
  let token = pageToken;
  let newStartPageToken = pageToken;

  while (token) {
    const params = new URLSearchParams({
      pageToken: token,
      fields:
        "newStartPageToken,nextPageToken,changes(file(id,name,mimeType,modifiedTime,size,parents,trashed))",
    });
    const res = await driveFetch(accessToken, `/changes?${params.toString()}`);
    const data = await res.json();

    for (const change of data.changes ?? []) {
      if (change.file) files.push(change.file);
    }

    if (data.newStartPageToken) {
      newStartPageToken = data.newStartPageToken;
    }
    if (!data.nextPageToken) break;
    token = data.nextPageToken;
  }

  return { files, newStartPageToken };
}

export async function listPdfFilesInFolder(
  accessToken: string,
  folderId: string,
  modifiedAfter?: string,
): Promise<DriveChangeFile[]> {
  const qParts = [
    `'${folderId}' in parents`,
    "mimeType = 'application/pdf'",
    "trashed = false",
  ];
  if (modifiedAfter) {
    qParts.push(`modifiedTime > '${modifiedAfter}'`);
  }
  const params = new URLSearchParams({
    q: qParts.join(" and "),
    fields: "files(id,name,mimeType,modifiedTime,size,parents,trashed)",
    orderBy: "modifiedTime desc",
    pageSize: "100",
  });
  const res = await driveFetch(accessToken, `/files?${params.toString()}`);
  const data = await res.json();
  return (data.files ?? []) as DriveChangeFile[];
}

export async function watchChanges(
  accessToken: string,
  pageToken: string,
  channelId: string,
  webhookUrl: string,
  webhookToken: string,
) {
  const params = new URLSearchParams({ pageToken });
  const res = await driveFetch(accessToken, `/changes/watch?${params.toString()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: channelId,
      type: "web_hook",
      address: webhookUrl,
      token: webhookToken,
    }),
  });
  return (await res.json()) as {
    resourceId: string;
    expiration: string;
  };
}

export async function stopChannel(
  accessToken: string,
  channelId: string,
  resourceId: string,
) {
  await fetch("https://www.googleapis.com/drive/v3/channels/stop", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ id: channelId, resourceId }),
  });
}

/**
 * GoodNotes 백업 PDF는 손글씨라 텍스트 레이어가 없는 경우가 많다.
 * (docs/roadmap-drive-goodnotes-supabase.md 위험 요소 참고)
 * LLM/OCR 없이 메타데이터 기반으로만 요약을 생성한다.
 */
export function buildMetadataSummary(
  file: DriveChangeFile,
  isNew: boolean,
): string {
  const sizeKb = file.size ? Math.round(Number(file.size) / 1024) : null;
  const modified = new Date(file.modifiedTime).toLocaleString("ko-KR");
  const parts = [
    isNew ? "Google Drive에서 새로 발견된 파일입니다." : "Drive에서 변경이 감지되었습니다.",
    `수정 시각: ${modified}`,
  ];
  if (sizeKb !== null) parts.push(`파일 크기: 약 ${sizeKb}KB`);
  return parts.join(" · ");
}
