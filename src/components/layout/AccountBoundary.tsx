"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { applyAuthenticatedUser, AUTH_CHANGED_EVENT, getCurrentUser } from "@/lib/auth-storage";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";
import { initializeP0Account, startP0SyncListener, stopP0Sync } from "@/lib/p0-sync";

/** Do not mount data readers until the server has verified the cached session.
 * Remount all private screens when the principal changes, including other tabs. */
export function AccountBoundary({ children }: { children: React.ReactNode }) {
  const [identity, setIdentity] = useState<string | null>(null);
  const [syncError, setSyncError] = useState("");
  const pendingIdentity = useRef<string | null>(null);
  const loadedIdentity = useRef<string | null>(null);
  useEffect(() => {
    let stopped = false;
    let version = 0;
    const supabase = getSupabaseBrowserClient();
    const sync = () => {
      const id = getCurrentUser()?.id ?? "guest";
      if (pendingIdentity.current === id) return;
      setIdentity(id);
    };
    const showSyncError = (event: Event) => {
      const message = (event as CustomEvent<string>).detail;
      setSyncError(message || "학습 데이터 동기화에 실패했습니다.");
    };
    const stopListening = startP0SyncListener();
    const clearSyncError = () => setSyncError("");
    window.addEventListener(AUTH_CHANGED_EVENT, sync);
    window.addEventListener("unilink:p0SyncError", showSyncError);
    window.addEventListener("unilink:p0SyncSuccess", clearSyncError);
    async function verify() {
      const request = ++version;
      try {
        const { data, error } = supabase ? await supabase.auth.getUser() : { data: { user: null }, error: null };
        if (stopped || request !== version) return;
        const user = error ? null : data.user;
        if (user && loadedIdentity.current === user.id && getCurrentUser()?.id === user.id) return;
        if (!user) { loadedIdentity.current = null; stopP0Sync(); }
        pendingIdentity.current = user?.id ?? "guest";
        setIdentity(null);
        applyAuthenticatedUser(user);
        if (user) {
          try {
            await initializeP0Account(user.id);
            if (stopped || request !== version) return;
            setSyncError("");
            loadedIdentity.current = user.id;
          } catch (syncError) {
            if (stopped || request !== version) return;
            setSyncError(syncError instanceof Error ? syncError.message : "학습 데이터 동기화에 실패했습니다.");
          }
        }
        pendingIdentity.current = null;
        if (!stopped && request === version) setIdentity(user?.id ?? "guest");
      } catch {
        if (!stopped && request === version) {
          pendingIdentity.current = "guest";
          applyAuthenticatedUser(null);
          pendingIdentity.current = null;
          setIdentity("guest");
        }
      }
    }
    // Defer network calls outside Supabase's auth callback lock.
    const { data } = supabase?.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        version++;
        loadedIdentity.current = null;
        pendingIdentity.current = null;
        stopP0Sync();
        applyAuthenticatedUser(null);
      } else {
        if (session?.user.id !== getCurrentUser()?.id) setIdentity(null);
        queueMicrotask(() => { if (!stopped) void verify(); });
      }
    }) ?? { data: null };
    void verify();
    return () => {
      stopped = true;
      loadedIdentity.current = null;
      data?.subscription.unsubscribe();
      stopListening();
      stopP0Sync();
      window.removeEventListener(AUTH_CHANGED_EVENT, sync);
      window.removeEventListener("unilink:p0SyncError", showSyncError);
      window.removeEventListener("unilink:p0SyncSuccess", clearSyncError);
    };
  }, []);
  if (identity === null) return <p className="p-6 text-sm text-muted-foreground">로그인 상태 확인 중…</p>;
  return <Fragment key={identity}>
    {syncError && identity !== "guest" && <div role="alert" className="fixed bottom-4 right-4 z-[100] max-w-md rounded-md border border-red-300 bg-white px-4 py-3 text-sm text-red-700 shadow-lg">
      학습 데이터 동기화 오류: {syncError}
    </div>}
    {children}
  </Fragment>;
}
