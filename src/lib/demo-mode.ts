export const DEMO_MODE_KEY = "unilink:demo-mode";

export function isDemoMode() {
  if (typeof window === "undefined") return false;
  return Boolean(window.location?.search && new URLSearchParams(window.location.search).get("demo") === "1")
    || window.sessionStorage?.getItem(DEMO_MODE_KEY) === "1";
}
