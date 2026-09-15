import { getStorageUser } from "./private-storage.ts";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { describeFunctionError } from "@/lib/supabase/function-error";

export interface DriveConnectionStatus {
  connected: boolean;
  folderId: string | null;
  folderIds: string[];
  folderNames: string[];
  accountEmail: string | null;
  accountName: string | null;
  accountPhotoUrl: string | null;
  channelActive: boolean;
  channelExpiration: string | null;
}

const disconnectedStatus: DriveConnectionStatus = {
  connected: false,
  folderId: null,
  folderIds: [],
  folderNames: [],
  accountEmail: null,
  accountName: null,
  accountPhotoUrl: null,
  channelActive: false,
  channelExpiration: null,
};

interface DriveProfileResult {
  accountEmail: string | null;
  accountName: string | null;
  accountPhotoUrl: string | null;
}

function makeConnectedStatus(
  partial: Partial<DriveConnectionStatus> = {},
): DriveConnectionStatus {
  return {
    connected: true,
    folderId: partial.folderId ?? null,
    folderIds: partial.folderIds ?? (partial.folderId ? [partial.folderId] : []),
    folderNames: partial.folderNames ?? [],
    accountEmail: partial.accountEmail ?? null,
    accountName: partial.accountName ?? null,
    accountPhotoUrl: partial.accountPhotoUrl ?? null,
    channelActive: partial.channelActive ?? false,
    channelExpiration: partial.channelExpiration ?? null,
  };
}

export async function getDriveConnectionStatus(): Promise<DriveConnectionStatus> {
  if (!isSupabaseConfigured) return disconnectedStatus;
  const supabase = getSupabaseClient()!;

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id ?? null;
  if (!userId) {
    return disconnectedStatus;
  }

  const { data, error } = await supabase
    .from("drive_connections")
    .select("folder_id, folder_ids, folder_names, channel_id, channel_expiration")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error("Drive 연결 상태를 확인하지 못했습니다.");
  if (!data) return disconnectedStatus;

  const channelActive =
    Boolean(data.channel_id) &&
    Boolean(data.channel_expiration) &&
    new Date(data.channel_expiration as string).getTime() > Date.now();
  let accountEmail: string | null = null;
  let accountName: string | null = null;
  let accountPhotoUrl: string | null = null;

  try {
    const { data: accountData } = await supabase
      .from("drive_connections")
      .select("account_email, account_name, account_photo_url")
      .eq("user_id", userId)
      .maybeSingle();
    accountEmail = accountData?.account_email ?? null;
    accountName = accountData?.account_name ?? null;
    accountPhotoUrl = accountData?.account_photo_url ?? null;
  } catch {
    // Older Supabase schemas do not have account profile columns yet.
    // Keep the connection badge correct and show account info after migration.
  }

  if (!accountEmail && !accountName) {
    try {
      const { data: profile } =
        await supabase.functions.invoke<DriveProfileResult>("drive-profile");
      accountEmail = profile?.accountEmail ?? null;
      accountName = profile?.accountName ?? null;
      accountPhotoUrl = profile?.accountPhotoUrl ?? null;
    } catch {
      // Keep the connection usable even when the profile backfill function is not deployed yet.
    }
  }

  const status = makeConnectedStatus({
    folderId: data.folder_id ?? null,
    folderIds: Array.isArray(data.folder_ids)
      ? data.folder_ids
      : data.folder_id
        ? [data.folder_id]
        : [],
    folderNames: Array.isArray(data.folder_names) ? data.folder_names : [],
    accountEmail,
    accountName,
    accountPhotoUrl,
    channelActive,
    channelExpiration: data.channel_expiration ?? null,
  });
  return status;
}

const DRIVE_PROOF_KEY = "unilink:drive-oauth-proof";
let completion: Promise<boolean> | null = null;
let completionOwner: string | null = null;

/** The verifier never leaves the initiating tab until authenticated completion. */
export async function startDriveConnection(): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase가 설정되지 않았습니다.");
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("로그인이 필요합니다.");
  const verifier = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, "0")).join("");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest))).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  const { data, error } = await supabase.functions.invoke<{ url: string; state: string }>("google-auth/start", {
    body: { codeChallenge: challenge },
  });
  if (error || !data?.url || !data.state) throw new Error("Google 연결을 시작하지 못했습니다.");
  const target = new URL(data.url);
  if (target.origin !== "https://accounts.google.com") throw new Error("유효하지 않은 Google 인증 주소입니다.");
  window.sessionStorage.setItem(DRIVE_PROOF_KEY, JSON.stringify({ verifier, state: data.state, userId: user.id, createdAt: Date.now() }));
  completion = null;
  window.location.assign(target.toString());
}

export function completeDriveConnection(): Promise<boolean> {
  // React StrictMode may mount an effect twice. Redeem a code only once.
  if (completion && completionOwner === getStorageUser()) return completion;
  completionOwner = getStorageUser();
  completion = null;
  const params = new URLSearchParams(window.location.hash.slice(1));
  if (!params.has("drive_code") && !params.has("drive_error")) return Promise.resolve(false);
  const raw = window.sessionStorage.getItem(DRIVE_PROOF_KEY);
  window.sessionStorage.removeItem(DRIVE_PROOF_KEY);
  window.history.replaceState({}, "", window.location.pathname + window.location.search);
  completion = (async () => {
    if (params.has("drive_error") || !raw) throw new Error("연결을 시작한 브라우저에서 다시 시도해주세요.");
    const proof = JSON.parse(raw);
    const supabase = getSupabaseClient();
    const { data: { user } } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
    if (!supabase || !user || proof.userId !== user.id || proof.state !== params.get("drive_state") ||
        !Number.isFinite(proof.createdAt) || Date.now() - proof.createdAt > 600_000) {
      throw new Error("연결 요청이 만료되었거나 로그인 계정이 변경되었습니다.");
    }
    const { error } = await supabase.functions.invoke("google-auth/complete", {
      body: { code: params.get("drive_code"), state: proof.state, verifier: proof.verifier },
    });
    if (error) throw new Error("Google 연결을 확인하지 못했습니다. 연결을 다시 시작해주세요.");
    return true;
  })();
  return completion;
}

export async function disconnectDrive(): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  const { error } = await supabase.functions.invoke("drive-disconnect");
  if (error) throw new Error(await describeFunctionError(error, "연결 해제에 실패했습니다."));
}

export interface DriveSyncResult {
  syncedAt: string;
  filesFound: number;
  upserted: number;
}

export interface DriveFolder {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  parents?: string[];
}

export async function listDriveFolders(parentId?: string | null): Promise<DriveFolder[]> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase가 설정되지 않았습니다.");

  const { data, error } = await supabase.functions.invoke<{ folders: DriveFolder[] }>(
    "drive-folders",
    {
      body: parentId ? { parentId } : {},
    },
  );
  if (error || !data) {
    throw new Error(await describeFunctionError(error, "Drive 폴더 목록을 불러오지 못했습니다."));
  }
  return data.folders ?? [];
}

export async function syncDriveFolders(
  folderIds?: string[],
  folderNames?: string[],
): Promise<DriveSyncResult> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase가 설정되지 않았습니다.");

  const { data, error } = await supabase.functions.invoke<DriveSyncResult>("drive-sync", {
    body: folderIds?.length ? { folderIds, folderNames } : {},
  });
  if (error || !data) {
    throw new Error(await describeFunctionError(error, "동기화에 실패했습니다."));
  }
  return data;
}

export async function syncDriveFolder(folderId?: string): Promise<DriveSyncResult> {
  return syncDriveFolders(folderId ? [folderId] : undefined);
}

export async function fetchDrivePdf(fileId: string): Promise<Blob> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase가 설정되지 않았습니다.");

  const { data, error } = await supabase.functions.invoke<Blob>("drive-file", {
    body: { fileId },
  });
  if (error || !(data instanceof Blob)) {
    throw new Error(await describeFunctionError(error, "Google Drive PDF를 불러오지 못했습니다."));
  }
  if (data.type !== "application/pdf" || data.size > 20 * 1024 * 1024 || await data.slice(0, 5).text() !== "%PDF-") {
    throw new Error("미리보기는 20MB 이하의 유효한 PDF만 지원합니다.");
  }
  return data;
}

export async function enableRealtimeWatch(): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase가 설정되지 않았습니다.");
  const { error } = await supabase.functions.invoke("drive-watch");
  if (error) throw new Error(await describeFunctionError(error, "실시간 동기화 활성화에 실패했습니다."));
}
