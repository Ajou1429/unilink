"use client";

import { useEffect, useRef, useState } from "react";
import { Save, Unlink } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";
import { getStorageUser } from "@/lib/private-storage";
import { flushP0Changes } from "@/lib/p0-sync";

type Goal = { id: string; title: string };
type Topic = { id: string; goal_id: string; title: string };
type Link = { goal_id: string; topic_id: string | null };

export function ProblemBankCoachingLink({ subjectId }: { subjectId: string }) {
  const [goals, setGoals] = useState<Goal[]>([]), [topics, setTopics] = useState<Topic[]>([]);
  const [goalId, setGoalId] = useState(""), [topicId, setTopicId] = useState("");
  const [saved, setSaved] = useState<Link | null>(null), [busy, setBusy] = useState(true);
  const [available, setAvailable] = useState(false), [message, setMessage] = useState("");
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    async function load() {
      try {
        const db = getSupabaseBrowserClient(), user = db ? (await db.auth.getUser()).data.user : null;
        if (!db || !user || getStorageUser() !== user.id) return;
        await flushP0Changes();
        const link = await db.from("problem_bank_coaching_links").select("goal_id,topic_id").eq("user_id", user.id).eq("subject_id", subjectId).maybeSingle();
        if (link.error && ["42P01", "PGRST205"].includes(link.error.code)) {
          if (alive.current) setMessage("코칭 연결 DB 적용 대기");
          return;
        }
        if (link.error) throw link.error;
        const [goalRows, topicRows] = await Promise.all([
          db.from("learning_goals").select("id,title").eq("user_id", user.id).eq("status", "active").order("title").limit(201),
          db.from("goal_topics").select("id,goal_id,title").eq("user_id", user.id).eq("status", "confirmed").order("title").limit(501),
        ]);
        if (goalRows.error || topicRows.error) throw new Error("학습 목표를 불러오지 못했습니다.");
        if (!alive.current || getStorageUser() !== user.id) return;
        if ((goalRows.data?.length ?? 0) > 200 || (topicRows.data?.length ?? 0) > 500) throw new Error("학습 목표·주제 조회 범위를 초과했습니다.");
        setGoals(goalRows.data ?? []); setTopics(topicRows.data ?? []); setSaved(link.data);
        setGoalId(link.data?.goal_id ?? ""); setTopicId(link.data?.topic_id ?? ""); setAvailable(true);
      } catch (error) { if (alive.current) setMessage(error instanceof Error ? error.message : "코칭 연결을 불러오지 못했습니다."); }
      finally { if (alive.current) setBusy(false); }
    }
    void load();
    return () => { alive.current = false; };
  }, [subjectId]);

  async function save(remove = false) {
    if (busy || !available || (!remove && !goals.some(g => g.id === goalId))) return;
    setBusy(true); setMessage("");
    try {
      const db = getSupabaseBrowserClient(), user = db ? (await db.auth.getUser()).data.user : null;
      if (!db || !user || getStorageUser() !== user.id) throw new Error("다시 로그인해 주세요.");
      const link = { goal_id: goalId, topic_id: topics.some(t => t.id === topicId && t.goal_id === goalId) ? topicId : null };
      const result = remove
        ? await db.from("problem_bank_coaching_links").delete().eq("user_id", user.id).eq("subject_id", subjectId)
        : await db.from("problem_bank_coaching_links").upsert({ subject_id: subjectId, user_id: user.id, ...link }, { onConflict: "subject_id,user_id" });
      if (result.error) throw result.error;
      if (!alive.current || getStorageUser() !== user.id) return;
      setSaved(remove ? null : link);
      if (remove) { setGoalId(""); setTopicId(""); }
      setMessage(remove ? "코칭 연결을 해제했습니다." : "코칭 연결을 저장했습니다.");
    } catch (error) { if (alive.current) setMessage(error instanceof Error ? error.message : "코칭 연결을 저장하지 못했습니다."); }
    finally { if (alive.current) setBusy(false); }
  }
  const goalOptions = saved && !goals.some(g => g.id === saved.goal_id) ? [{ id: saved.goal_id, title: "비활성 목표 (연결 변경 필요)" }, ...goals] : goals;
  return <section aria-label="문제은행 코칭 연결" className="mt-4 border-y border-gray-200 py-3">
    <p className="mb-3 break-words text-xs text-gray-600">연결한 문제은행 이름·문제 라벨·학습 단계·기록 시점과 목표·주제 연결 정보는 이후 AI 계획 생성 시 OpenAI에 전송됩니다. 연결을 해제하면 이후 코칭 전송에서 제외되며, 이전 코칭 기록은 별도로 남습니다.</p>
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto]">
      <label className="col-span-2 min-w-0 text-xs font-medium sm:col-span-1">코칭 학습 목표
        <select aria-label="코칭 학습 목표" className="mt-1 w-full min-w-0 rounded border bg-white p-2 text-sm" disabled={busy || !available} value={goalId}
          onChange={e => { setGoalId(e.target.value); setTopicId(""); }}>
          <option value="">연결 안 함</option>{goalOptions.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
        </select>
      </label>
      <label className="col-span-2 min-w-0 text-xs font-medium sm:col-span-1">이 문제은행 전체의 공통 주제 (선택)
        <select aria-label="이 문제은행 전체의 공통 주제 (선택)" className="mt-1 w-full min-w-0 rounded border bg-white p-2 text-sm" disabled={busy || !available || !goalId} value={topicId} onChange={e => setTopicId(e.target.value)}>
          <option value="">주제 미지정</option>{topics.filter(t => t.goal_id === goalId).map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
        </select>
      </label>
      <button type="button" disabled={busy || !available || !goals.some(g => g.id === goalId)} onClick={() => void save()}
        className="flex h-9 w-fit items-center gap-1 rounded border bg-white px-3 text-sm disabled:opacity-50"><Save size={15} />연결 저장</button>
      {saved && <button type="button" title="코칭 연결 해제" aria-label="코칭 연결 해제" disabled={busy} onClick={() => void save(true)} className="flex h-9 w-9 items-center justify-center rounded border bg-white"><Unlink size={16} /></button>}
    </div>
    <p role="status" className="mt-2 break-words text-xs text-gray-600">{message || (busy ? "불러오는 중…" : saved ? "코칭 연결됨" : "코칭 미연결")}</p>
  </section>;
}
