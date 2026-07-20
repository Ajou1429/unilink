import { FunctionsHttpError } from "@supabase/supabase-js";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";

/**
 * supabase-js는 Edge Function이 non-2xx를 반환하면 항상 같은 문구
 * ("Edge Function returned a non-2xx status code")만 던진다. 실제 원인은
 * 응답 본문({ error: "..." }, 우리 함수들의 jsonResponse 포맷)에 있으므로 꺼내온다.
 */
async function describeFunctionError(error: unknown, fallback: string): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.clone().json();
      if (body?.error) return `${body.error} (HTTP ${error.context.status})`;
    } catch {
      // 본문이 JSON이 아니면 그냥 아래 fallback으로 진행
    }
    return `${fallback} (HTTP ${error.context.status})`;
  }
  return error instanceof Error ? error.message : fallback;
}

export interface DriveConnectionStatus {
  connected: boolean;
  folderId: string | null;
  channelActive: boolean;
  channelExpiration: string | null;
}

const disconnectedStatus: DriveConnectionStatus = {
  connected: false,
  folderId: null,
  channelActive: false,
  channelExpiration: null,
};

export async function getDriveConnectionStatus(): Promise<DriveConnectionStatus> {
  if (!isSupabaseConfigured) return disconnectedStatus;
  const supabase = getSupabaseClient()!;

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return disconnectedStatus;

  const { data, error } = await supabase
    .from("drive_connections")
    .select("folder_id, channel_id, channel_expiration")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (error || !data) return disconnectedStatus;

  const channelActive =
    Boolean(data.channel_id) &&
    Boolean(data.channel_expiration) &&
    new Date(data.channel_expiration as string).getTime() > Date.now();

  return {
    connected: true,
    folderId: data.folder_id ?? null,
    channelActive,
    channelExpiration: data.channel_expiration ?? null,
  };
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
}

export interface DriveSyncResult {
  syncedAt: string;
  filesFound: number;
  upserted: number;
}

export async function syncDriveFolder(folderId?: string): Promise<DriveSyncResult> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase가 설정되지 않았습니다.");

  const { data, error } = await supabase.functions.invoke<DriveSyncResult>("drive-sync", {
    body: folderId ? { folderId } : {},
  });
  if (error || !data) {
    throw new Error(await describeFunctionError(error, "동기화에 실패했습니다."));
  }
  return data;
}

export async function enableRealtimeWatch(): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase가 설정되지 않았습니다.");
  const { error } = await supabase.functions.invoke("drive-watch");
  if (error) throw new Error(await describeFunctionError(error, "실시간 동기화 활성화에 실패했습니다."));
}
