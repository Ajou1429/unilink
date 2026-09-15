"use client";

import { Fragment, useEffect, useState } from "react";
import { applyAuthenticatedUser, AUTH_CHANGED_EVENT, getCurrentUser } from "@/lib/auth-storage";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";

/** Do not mount data readers until the server has verified the cached session.
 * Remount all private screens when the principal changes, including other tabs. */
export function AccountBoundary({ children }: { children: React.ReactNode }) {
  const [identity, setIdentity] = useState<string | null>(null);
  useEffect(() => {
    let stopped = false;
    let version = 0;
    const supabase = getSupabaseBrowserClient();
    const sync = () => setIdentity(getCurrentUser()?.id ?? "guest");
    window.addEventListener(AUTH_CHANGED_EVENT, sync);
    async function verify() {
      const request = ++version;
      try {
        const { data, error } = supabase ? await supabase.auth.getUser() : { data: { user: null }, error: null };
        if (stopped || request !== version) return;
        applyAuthenticatedUser(error ? null : data.user);
      } catch {
        if (!stopped && request === version) applyAuthenticatedUser(null);
      }
    }
    // Defer network calls outside Supabase's auth callback lock.
    const { data } = supabase?.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        version++;
        applyAuthenticatedUser(null);
      } else {
        if (session?.user.id !== getCurrentUser()?.id) setIdentity(null);
        queueMicrotask(() => { if (!stopped) void verify(); });
      }
    }) ?? { data: null };
    void verify();
    return () => {
      stopped = true;
      data?.subscription.unsubscribe();
      window.removeEventListener(AUTH_CHANGED_EVENT, sync);
    };
  }, []);
  if (identity === null) return <p className="p-6 text-sm text-muted-foreground">로그인 상태 확인 중…</p>;
  return <Fragment key={identity}>{children}</Fragment>;
}
