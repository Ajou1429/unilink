"use client";

import { useEffect, useRef, useState } from "react";
import { Save, Trash2 } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";
import { getStorageUser } from "@/lib/private-storage";

export function CoachingSatisfactionPanel({ runId }: { runId: string }) {
  const [rating, setRating] = useState(""),
    [difficulty, setDifficulty] = useState(""),
    [time, setTime] = useState("");
  const [saved, setSaved] = useState(false),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(true),
    [message, setMessage] = useState("");
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    async function load() {
      try {
        const db = getSupabaseBrowserClient(),
          user = db ? (await db.auth.getUser()).data.user : null;
        if (!db || !user || getStorageUser() !== user.id) {
          throw new Error("다시 로그인해 주세요.");
        }
        const result = await db.from("coaching_satisfaction").select(
          "rating,difficulty_fit,time_fit",
        ).eq("user_id", user.id).eq("run_id", runId).maybeSingle();
        if (result.error) {
          if (["42P01", "PGRST205"].includes(result.error.code)) {
            throw new Error("만족도 기록 DB 적용 대기");
          }
          throw result.error;
        }
        if (!alive.current || getStorageUser() !== user.id) return;
        setReady(true);
        setSaved(Boolean(result.data));
        setRating(result.data ? String(result.data.rating) : "");
        setDifficulty(result.data?.difficulty_fit ?? "");
        setTime(result.data?.time_fit ?? "");
      } catch (error) {
        if (alive.current) {
          setMessage(
            error instanceof Error
              ? error.message
              : "만족도를 불러오지 못했습니다.",
          );
        }
      } finally {
        if (alive.current) setBusy(false);
      }
    }
    void load();
    return () => {
      alive.current = false;
    };
  }, [runId]);
  async function save(remove = false) {
    if (busy || !ready || (!remove && !rating)) return;
    setBusy(true);
    setMessage("");
    try {
      const db = getSupabaseBrowserClient(),
        user = db ? (await db.auth.getUser()).data.user : null;
      if (!db || !user || getStorageUser() !== user.id) {
        throw new Error("다시 로그인해 주세요.");
      }
      const result = remove
        ? await db.rpc("clear_coaching_satisfaction", { p_run: runId })
        : await db.rpc("record_coaching_satisfaction", {
          p_run: runId,
          p_rating: Number(rating),
          p_difficulty: difficulty || null,
          p_time: time || null,
        });
      if (result.error) throw result.error;
      if (!alive.current || getStorageUser() !== user.id) return;
      setSaved(!remove);
      if (remove) {
        setRating("");
        setDifficulty("");
        setTime("");
      }
      setMessage(
        remove ? "만족도 기록을 삭제했습니다." : "만족도를 저장했습니다.",
      );
      window.dispatchEvent(new Event("unilink:personalizationChanged"));
    } catch (error) {
      if (alive.current) {
        setMessage(
          error instanceof Error
            ? error.message
            : "만족도를 저장하지 못했습니다.",
        );
      }
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  const select = "mt-1 w-full rounded border bg-white p-2 text-sm";
  return (
    <section aria-label="이번 계획 만족도" className="mt-4 border-t pt-3">
      <h4 className="text-sm font-semibold">
        이번 계획 만족도{" "}
        <span className="font-normal text-muted-foreground">(선택)</span>
      </h4>
      <fieldset
        disabled={!ready || busy}
        className="mt-2 grid gap-3 sm:grid-cols-3"
      >
        <label className="text-xs">
          만족도<select
            aria-label="계획 만족도"
            className={select}
            value={rating}
            onChange={(e) => setRating(e.target.value)}
          >
            <option value="">미평가</option>
            {["매우 불만족", "불만족", "보통", "만족", "매우 만족"].map((
              v,
              i,
            ) => <option key={i} value={i + 1}>{i + 1} · {v}</option>)}
          </select>
        </label>
        <label className="text-xs">
          난이도 적합성<select
            aria-label="계획 난이도 적합성"
            className={select}
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
          >
            <option value="">미평가</option>
            <option value="too_easy">너무 쉬움</option>
            <option value="appropriate">적절함</option>
            <option value="too_hard">너무 어려움</option>
          </select>
        </label>
        <label className="text-xs">
          배정 시간 적합성<select
            aria-label="계획 배정 시간 적합성"
            className={select}
            value={time}
            onChange={(e) => setTime(e.target.value)}
          >
            <option value="">미평가</option>
            <option value="too_short">너무 짧음</option>
            <option value="appropriate">적절함</option>
            <option value="too_long">너무 김</option>
          </select>
        </label>
      </fieldset>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          disabled={!ready || busy || !rating}
          onClick={() => void save()}
          className="flex items-center gap-1 rounded border px-3 py-2 text-sm disabled:opacity-50"
        >
          <Save size={14} />평가 저장
        </button>
        {saved && (
          <button
            type="button"
            aria-label="만족도 기록 삭제"
            title="만족도 기록 삭제"
            disabled={busy}
            onClick={() => void save(true)}
            className="rounded border p-2"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>
      <p role="status" className="mt-2 text-xs text-muted-foreground">
        {message || (busy ? "불러오는 중…" : saved ? "기록됨" : "미평가")}
      </p>
    </section>
  );
}
