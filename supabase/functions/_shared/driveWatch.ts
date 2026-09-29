import { getAdminClient } from "./supabaseAdmin.ts";
import { decryptSecret } from "./crypto.ts";
import {
  GoogleTokenError,
  getStartPageToken,
  refreshAccessToken,
  stopChannel,
  watchChanges,
} from "./google.ts";

export class DriveWatchRenewalError extends Error {
  constructor(
    readonly stage: string,
    cause: unknown,
  ) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = "DriveWatchRenewalError";
    this.code = cause instanceof GoogleTokenError ? cause.code : null;
  }

  readonly code: string | null;
}

async function runRenewalStage<T>(stage: string, action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    throw new DriveWatchRenewalError(stage, error);
  }
}

export async function registerWatchForConnection(
  admin: ReturnType<typeof getAdminClient>,
  connection: {
    user_id: string;
    refresh_token_encrypted: string;
    refresh_token_iv: string;
    channel_id: string | null;
    resource_id: string | null;
    page_token: string | null;
  },
) {
  const refreshToken = await runRenewalStage("decrypt_refresh_token", () =>
    decryptSecret(
      connection.refresh_token_encrypted,
      connection.refresh_token_iv,
    )
  );
  const { access_token } = await runRenewalStage("refresh_google_token", () =>
    refreshAccessToken(refreshToken)
  );

  if (connection.channel_id && connection.resource_id) {
    await stopChannel(access_token, connection.channel_id, connection.resource_id).catch(
      () => undefined,
    );
  }

  const pageToken =
    connection.page_token ?? (await runRenewalStage("get_drive_cursor", () =>
      getStartPageToken(access_token)
    ));
  const channelId = crypto.randomUUID();
  const webhookUrl = Deno.env.get("GOOGLE_DRIVE_WEBHOOK_URL")!;
  const webhookToken = Deno.env.get("GOOGLE_DRIVE_WEBHOOK_TOKEN")!;

  if (!webhookUrl || !webhookToken) {
    throw new DriveWatchRenewalError(
      "validate_webhook_config",
      new Error("GOOGLE_DRIVE_WEBHOOK_URL or GOOGLE_DRIVE_WEBHOOK_TOKEN is missing"),
    );
  }

  const { resourceId, expiration } = await runRenewalStage("register_drive_channel", () =>
    watchChanges(
      access_token,
      pageToken,
      channelId,
      webhookUrl,
      webhookToken,
    )
  );

  const { error } = await admin
    .from("drive_connections")
    .update({
      channel_id: channelId,
      resource_id: resourceId,
      channel_expiration: new Date(Number(expiration)).toISOString(),
      page_token: pageToken,
      connection_status: "active",
      last_error_code: null,
      last_error_at: null,
    })
    .eq("user_id", connection.user_id);
  if (error) {
    throw new DriveWatchRenewalError("save_channel_state", error);
  }

  return { channelId, resourceId, expiration };
}
