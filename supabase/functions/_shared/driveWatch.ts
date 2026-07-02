import { getAdminClient } from "./supabaseAdmin.ts";
import { decryptSecret } from "./crypto.ts";
import {
  getStartPageToken,
  refreshAccessToken,
  stopChannel,
  watchChanges,
} from "./google.ts";

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
  const refreshToken = await decryptSecret(
    connection.refresh_token_encrypted,
    connection.refresh_token_iv,
  );
  const { access_token } = await refreshAccessToken(refreshToken);

  if (connection.channel_id && connection.resource_id) {
    await stopChannel(access_token, connection.channel_id, connection.resource_id).catch(
      () => undefined,
    );
  }

  const pageToken =
    connection.page_token ?? (await getStartPageToken(access_token));
  const channelId = crypto.randomUUID();
  const webhookUrl = Deno.env.get("GOOGLE_DRIVE_WEBHOOK_URL")!;
  const webhookToken = Deno.env.get("GOOGLE_DRIVE_WEBHOOK_TOKEN")!;

  const { resourceId, expiration } = await watchChanges(
    access_token,
    pageToken,
    channelId,
    webhookUrl,
    webhookToken,
  );

  await admin
    .from("drive_connections")
    .update({
      channel_id: channelId,
      resource_id: resourceId,
      channel_expiration: new Date(Number(expiration)).toISOString(),
      page_token: pageToken,
    })
    .eq("user_id", connection.user_id);

  return { channelId, resourceId, expiration };
}
