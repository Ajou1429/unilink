export const DEMO_MODE_KEY = "unilink:demo-mode";

export function isAuthenticationRoute() {
  if (typeof window === "undefined") return false;
  return /\/(login|signup)\/?$/.test(window.location?.pathname ?? "");
}

export function clearDemoModeOnAuthenticationRoute() {
  if (isAuthenticationRoute()) window.sessionStorage.removeItem(DEMO_MODE_KEY);
}

export function isDemoMode() {
  if (typeof window === "undefined") return false;
  if (isAuthenticationRoute()) return false;
  return Boolean(window.location?.search && new URLSearchParams(window.location.search).get("demo") === "1")
    || window.sessionStorage?.getItem(DEMO_MODE_KEY) === "1";
}
