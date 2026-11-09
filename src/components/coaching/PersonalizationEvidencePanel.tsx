"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";
import { getStorageUser } from "@/lib/private-storage";

type Observation = {
  event_id: string;
  goal_id: string;
  event_type: string;
  observed_at: string;
  details: {
    actual_minutes?: number | null;
    completion_status?: string;
    self_rating?: number | null;
    rating?: number;
    had_one_off_request?: boolean;
  };
};

type Evidence = {
  key: string;
  revision: number;
  rows: Observation[];
  message: string;
};

function observationLabel(row: Observation) {
  if (row.event_type === "study_result") {
    const status: Record<string, string> = {
      completed: "완료",
      partial: "부분 완료",
      abandoned: "중단",
    };
    const minutes = row.details.actual_minutes == null
      ? "시간 미기록"
      : `${row.details.actual_minutes}분`;
    return `학습 실행 · ${minutes} · ${
      status[row.details.completion_status ?? ""] ?? "기록"
    }`;
  }
  if (row.event_type === "understanding") {
    return `자기 이해도 · ${
      row.details.self_rating == null
        ? "미평가"
        : `${row.details.self_rating}/5`
    }`;
  }
  return `계획 만족도 · ${row.details.rating ?? "미평가"}/5${
    row.details.had_one_off_request ? " · 일회성 요청이 있던 계획" : ""
  }`;
}

export function PersonalizationEvidencePanel(
  { goals }: { goals: { id: string; title: string }[] },
) {
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [open, setOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  const key = goals.map((goal) => goal.id).join(",");

  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener("unilink:personalizationChanged", refresh);
    return () =>
      window.removeEventListener("unilink:personalizationChanged", refresh);
  }, []);

  useEffect(() => {
    if (!open || !key) return;
    let active = true;
    async function load() {
      try {
        const db = getSupabaseBrowserClient();
        const user = db ? (await db.auth.getUser()).data.user : null;
        if (!db || !user || getStorageUser() !== user.id) {
          throw new Error("다시 로그인해 주세요.");
        }
        const result = await db.from("learner_personalization_events")
          .select("event_id,goal_id,event_type,observed_at,details")
          .eq("user_id", user.id).in("goal_id", key.split(","))
          .order("observed_at", { ascending: false }).limit(31);
        if (result.error) {
          if (["42P01", "PGRST205"].includes(result.error.code)) {
            throw new Error("개인화 기록 DB 적용 대기");
          }
          throw result.error;
        }
        if (!active || getStorageUser() !== user.id) return;
        setEvidence({
          key,
          revision,
          rows: (result.data ?? []).slice(0, 30) as Observation[],
          message: (result.data?.length ?? 0) > 30 ? "최근 30개 표시" : "",
        });
      } catch (error) {
        if (active) {
          setEvidence({
            key,
            revision,
            rows: [],
            message: error instanceof Error
              ? error.message
              : "기록을 불러오지 못했습니다.",
          });
        }
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [open, key, revision]);

  // Hide the previous goal's records while a different selection is loading.
  const current = evidence?.key === key && evidence.revision === revision
    ? evidence
    : null;
  const rows = current?.rows ?? [];
  const message = !key
    ? "학습 목표 미선택"
    : !current
    ? "불러오는 중…"
    : current.message || (!rows.length ? "표시할 기록 없음" : "");

  return (
    <details
      className="border-t pt-3"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer text-sm font-semibold">
        내 개인화 근거 기록
      </summary>
      <ul className="mt-2 space-y-2 text-xs">
        {rows.map((row) => (
          <li
            key={`${row.event_type}:${row.event_id}:${row.goal_id}`}
            className="border-b py-2"
          >
            <strong className="block break-words">
              {goals.find((goal) => goal.id === row.goal_id)?.title ??
                "학습 목표"}
            </strong>
            <time>{new Date(row.observed_at).toLocaleString("ko-KR")}</time>
            {" · "}
            {observationLabel(row)}
          </li>
        ))}
      </ul>
      <p role="status" className="mt-2 text-xs text-muted-foreground">
        {message}
      </p>
    </details>
  );
}
