"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Cloud, Link2, RefreshCw, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AUTH_CHANGED_EVENT } from "@/lib/auth-storage";
import { getStorageUser } from "@/lib/private-storage";
import { isDemoMode } from "@/lib/demo-mode";
import {
  disconnectDrive,
  getDriveConnectionStatus,
  startDriveConnection,
  type DriveConnectionStatus,
} from "@/lib/drive-connection";

export function DriveAccountSettings() {
  const [status, setStatus] = useState<DriveConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let active = true;
    let revision = 0;
    async function load() {
      const request = ++revision;
      const owner = getStorageUser();
      setSignedIn(Boolean(owner));
      setStatus(null);
      setLoading(Boolean(owner));
      setError("");
      if (!owner || isDemoMode()) {
        setLoading(false);
        return;
      }
      try {
        const next = await getDriveConnectionStatus();
        if (active && request === revision && getStorageUser() === owner)
          setStatus(next);
      } catch (cause) {
        if (active && request === revision && getStorageUser() === owner)
          setError(
            cause instanceof Error
              ? cause.message
              : "Drive 연결 상태를 불러오지 못했습니다.",
          );
      } finally {
        if (active && request === revision) setLoading(false);
      }
    }
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("drive");
    let returnMessageTimer: number | undefined;
    if (outcome) {
      returnMessageTimer = window.setTimeout(() => {
        setMessage(
          outcome === "connected"
            ? "Google Drive 연결이 완료되었습니다."
            : "Google Drive 연결을 완료하지 못했습니다. 다시 시도해 주세요.",
        );
        params.delete("drive");
        window.history.replaceState(
          {},
          "",
          window.location.pathname +
            (params.size ? `?${params}` : "") +
            window.location.hash,
        );
      }, 0);
    }
    void load();
    window.addEventListener(AUTH_CHANGED_EVENT, load);
    window.addEventListener("focus", load);
    return () => {
      active = false;
      revision++;
      window.clearTimeout(returnMessageTimer);
      window.removeEventListener(AUTH_CHANGED_EVENT, load);
      window.removeEventListener("focus", load);
    };
  }, []);

  async function connect() {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await startDriveConnection("settings");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Drive 연결을 시작하지 못했습니다.",
      );
      setBusy(false);
    }
  }
  async function disconnect() {
    if (busy) return;
    const owner = getStorageUser();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await disconnectDrive();
      if (getStorageUser() !== owner) return;
      const next = await getDriveConnectionStatus();
      if (getStorageUser() !== owner) return;
      setStatus(next);
      setMessage("Google Drive 연결을 해제했습니다. 기존 노트는 유지됩니다.");
    } catch (cause) {
      if (getStorageUser() === owner)
        setError(
          cause instanceof Error ? cause.message : "연결 해제에 실패했습니다.",
        );
    } finally {
      setBusy(false);
    }
  }

  if (isDemoMode()) return null;

  return (
    <Card id="google-drive" className="scroll-mt-6 border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Cloud className="size-5 text-primary" />
          Google Drive 연결
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          학습 자료를 가져오거나 업로드할 Google Drive 계정을 관리합니다. Google
          로그인 연결과는 별도로 설정합니다.
        </p>
        {!signedIn ? (
          <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
            로그인 후 Google Drive 계정을 연결할 수 있습니다.
          </p>
        ) : loading ? (
          <p role="status" className="text-sm text-muted-foreground">
            Drive 연결 상태 확인 중…
          </p>
        ) : (
          <>
            <div className="rounded-lg border p-4">
              <p className="text-sm font-semibold">
                {status?.requiresReconnect
                  ? "다시 연결이 필요합니다"
                  : status?.connected
                    ? "연결됨"
                    : "연결 안 됨"}
              </p>
              {status?.connected && (
                <p className="mt-1 break-all text-sm text-muted-foreground">
                  {status.accountEmail ||
                    status.accountName ||
                    "Google Drive 계정"}
                </p>
              )}
              {status?.requiresReconnect && (
                <p className="mt-2 text-sm text-destructive">
                  인증이 만료되었습니다. 같은 Google 계정으로 다시 연결해
                  주세요.
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy} onClick={() => void connect()}>
                <Link2 className="size-4" />
                {busy
                  ? "처리 중…"
                  : status?.connected
                    ? "Google Drive 다시 연결"
                    : "Google Drive 연결하기"}
              </Button>
              {status?.connected && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void disconnect()}
                >
                  <Unlink className="size-4" />
                  연결 해제
                </Button>
              )}
            </div>
            <p className="text-xs leading-6 text-muted-foreground">
              재연결해도 기존 노트와 분류는 유지됩니다. 같은 계정으로 연결하면
              기존 Drive 자료를 계속 사용할 수 있습니다.
            </p>
          </>
        )}
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href="/notes" />}
        >
          <RefreshCw className="size-4" />
          폴더 선택·동기화는 나의 노트에서
        </Button>
        {message && (
          <p role="status" className="rounded-lg bg-muted p-3 text-sm">
            {message}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
