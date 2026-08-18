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

const DRIVE_CONNECTION_CACHE_KEY = "unilink:drive-connection-cache";

interface CachedDriveConnection {
  userId: string | null;
  status: DriveConnectionStatus;
  updatedAt: string;
}

function readCachedDriveStatus(userId: string | null): DriveConnectionStatus | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(DRIVE_CONNECTION_CACHE_KEY);
    if (!raw) return null;

    const cached = JSON.parse(raw) as CachedDriveConnection;
    if (cached.userId && userId && cached.userId !== userId) return null;
    if (!cached.status?.connected) return null;
    return {
      ...cached.status,
      folderIds: cached.status.folderIds ?? (cached.status.folderId ? [cached.status.folderId] : []),
      folderNames: cached.status.folderNames ?? [],
    };
  } catch {
    return null;
  }
}

function writeCachedDriveStatus(
  status: DriveConnectionStatus,
  userId: string | null,
) {
  if (typeof window === "undefined" || !status.connected) return;

  const cached: CachedDriveConnection = {
    userId,
    status,
    updatedAt: new Date().toISOString(),
  };
  window.localStorage.setItem(DRIVE_CONNECTION_CACHE_KEY, JSON.stringify(cached));
}

function clearCachedDriveStatus() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(DRIVE_CONNECTION_CACHE_KEY);
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
  if (!userId) return readCachedDriveStatus(null) ?? disconnectedStatus;

  const { data, error } = await supabase
    .from("drive_connections")
    .select("folder_id, folder_ids, folder_names, channel_id, channel_expiration")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return readCachedDriveStatus(userId) ?? disconnectedStatus;

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
  writeCachedDriveStatus(status, userId);
  return status;
}

export async function rememberDriveConnectionSucceeded(): Promise<DriveConnectionStatus> {
  if (!isSupabaseConfigured) return disconnectedStatus;

  const supabase = getSupabaseClient();
  const { data: userData } = supabase
    ? await supabase.auth.getUser()
    : { data: { user: null } };
  const userId = userData.user?.id ?? null;
  const previousStatus = readCachedDriveStatus(userId);
  const cachedStatus = makeConnectedStatus({
    folderId: previousStatus?.folderId ?? null,
    folderIds: previousStatus?.folderIds ?? [],
    folderNames: previousStatus?.folderNames ?? [],
    channelActive: previousStatus?.channelActive ?? false,
    channelExpiration: previousStatus?.channelExpiration ?? null,
  });
  writeCachedDriveStatus(cachedStatus, userId);

  for (const delay of [0, 500, 1500]) {
    if (delay > 0) {
      await new Promise((resolve) => window.setTimeout(resolve, delay));
    }

    const status = await getDriveConnectionStatus();
    if (status.connected) return status;
  }

  return cachedStatus;
}

/** Google 동의 화면 URL을 받아와 그 자리에서 이동시킨다. */
export async function startDriveConnection(): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase가 설정되지 않았습니다.");

  const { data, error } = await supabase.functions.invoke<{ url: string }>(
    "google-auth/start",
  );
  if (error || !data?.url) {
    throw new Error(await describeFunctionError(error, "Google 인증 URL을 가져오지 못했습니다."));
  }
  window.location.href = data.url;
}

export async function disconnectDrive(): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  const { error } = await supabase.functions.invoke("drive-disconnect");
  if (error) throw new Error(await describeFunctionError(error, "연결 해제에 실패했습니다."));
  clearCachedDriveStatus();
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

export async function enableRealtimeWatch(): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase가 설정되지 않았습니다.");
  const { error } = await supabase.functions.invoke("drive-watch");
  if (error) throw new Error(await describeFunctionError(error, "실시간 동기화 활성화에 실패했습니다."));
}
