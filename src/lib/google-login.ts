import { getSupabaseBrowserClient } from "./supabase-client";

export const GOOGLE_AUTH_RETURN_KEY = "unilink:google-auth-return";

function redirectTo(path: string) {
  // The hosted project currently allows only the localhost origin, not nested paths.
  if (window.location.origin === "http://localhost:3000") {
    window.sessionStorage.setItem(GOOGLE_AUTH_RETURN_KEY, path);
    return window.location.origin;
  }
  const basePath = window.location.pathname.startsWith("/unilink/") ? "/unilink" : "";
  return `${window.location.origin}${basePath}${path}`;
}

export async function signInWithGoogle() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return "계정 서비스가 설정되지 않았습니다.";
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: redirectTo("/dashboard"), scopes: "openid email profile" },
  });
  if (error) window.sessionStorage.removeItem(GOOGLE_AUTH_RETURN_KEY);
  return error?.message ?? null;
}

export async function linkGoogleToCurrentAccount() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return "계정 서비스가 설정되지 않았습니다.";
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return "먼저 일반 계정으로 로그인해주세요.";
  const { error } = await supabase.auth.linkIdentity({
    provider: "google",
    options: { redirectTo: redirectTo("/settings"), scopes: "openid email profile" },
  });
  if (error) window.sessionStorage.removeItem(GOOGLE_AUTH_RETURN_KEY);
  return error?.message ?? null;
}
