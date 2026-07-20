// POST /drive-profile
// Fetches and stores the Google account profile for an existing Drive connection.

import { corsHeaders, handleOptions, jsonResponse } from "../_shared/cors.ts";
import { decryptSecret } from "../_shared/crypto.ts";
import {
  getDriveAccountProfile,
  refreshAccessToken,
} from "../_shared/google.ts";
import { getAdminClient, getUserFromAuthHeader } from "../_shared/supabaseAdmin.ts";

Deno.serve(async (req) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) return optionsResponse;

  const user = await getUserFromAuthHeader(req);
  if (!user) return jsonResponse({ error: "인증이 필요합니다." }, { status: 401 });

  const admin = getAdminClient();
  const { data: connection, error } = await admin
    .from("drive_connections")
    .select("refresh_token_encrypted, refresh_token_iv")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) throw error;
  if (!connection) {
    return jsonResponse(
      { error: "Google Drive가 연결되어 있지 않습니다." },
      { status: 404 },
    );
  }

  const refreshToken = await decryptSecret(
    connection.refresh_token_encrypted,
    connection.refresh_token_iv,
  );
  const { access_token } = await refreshAccessToken(refreshToken);
  const profile = await getDriveAccountProfile(access_token);

  await admin
    .from("drive_connections")
    .update({
      account_email: profile.email,
      account_name: profile.name,
      account_photo_url: profile.photoUrl,
    })
    .eq("user_id", user.id);

  return jsonResponse(
    {
      accountEmail: profile.email,
      accountName: profile.name,
      accountPhotoUrl: profile.photoUrl,
    },
    { headers: corsHeaders },
  );
});
