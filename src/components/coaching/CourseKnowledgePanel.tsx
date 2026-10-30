"use client";

import { useEffect, useState } from "react";
import { Database, RefreshCw, ExternalLink } from "lucide-react";
import { courseKnowledgeEnabled, requestCourseKnowledge, type KnowledgeStatus } from "@/lib/course-knowledge";
import { getStorageUser } from "@/lib/private-storage";

const researchLabels: Record<string, string> = { disabled: "검색 미설정 · PDF/DB 기준", unavailable: "검색할 내용 근거 부족 · DB 기준", pending: "검색 대기 · PDF/DB 기준", ready: "검색 근거 저장됨", failed: "검색 실패 · PDF/DB 기준" };
export function CourseKnowledgePanel({ goalIds, asOf, live, busy, onResume, onRefresh }: {
  goalIds: string[]; asOf: string; live: Record<string, KnowledgeStatus>; busy: boolean; onResume: () => void; onRefresh: (goalId: string, noteId: string) => void;
}) {
  const [saved, setSaved] = useState<Record<string, KnowledgeStatus>>({});
  const [error, setError] = useState("");
  const [chosenNotes, setChosenNotes] = useState<Record<string, string>>({});
  const key = goalIds.join(",");
  useEffect(() => {
    if (!courseKnowledgeEnabled || !key) return;
    let active = true; const owner = getStorageUser();
    void Promise.all(key.split(",").map((id) => requestCourseKnowledge(id, asOf, { action: "status" })))
      .then((rows) => { if (active && owner === getStorageUser()) { setSaved(Object.fromEntries(rows.map((row) => [row.goal_id, row]))); setError(""); } })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : "과목 지식 조회에 실패했습니다."); });
    return () => { active = false; };
  }, [key, asOf]);
  if (!courseKnowledgeEnabled) return null;
  return <section aria-label="과목 지식 분석" className="border-y border-gray-200 py-4 text-sm space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="flex items-center gap-2 font-semibold"><Database size={16} /> 과목 지식</h3>
      <button type="button" title="저장된 결과부터 분석 이어가기" disabled={busy || !goalIds.length} onClick={onResume} className="inline-flex items-center gap-1 border rounded px-2 py-1 disabled:opacity-50"><RefreshCw size={14} /> 분석 이어가기</button></div>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {goalIds.map((id) => {
      const row = live[id] ?? saved[id];
      if (!row) return <p key={id}>과목 지식 확인 중…</p>;
      if (row.status === "disabled") return <p key={id}>서버의 과목 분석 설정이 필요합니다.</p>;
      return <div key={id} className="space-y-2 border-b border-gray-100 pb-3 last:border-0">
        <div className="flex flex-wrap justify-between gap-2"><strong>{row.title}</strong><span>{row.status === "failed" ? "일부 분석 실패" : row.overview_complete ? "자료 구조 분석 완료" : "자료 분석 대기/진행"}</span></div>
        <progress className="w-full h-2" aria-label={`${row.title} PDF 분석 완료`} max={Math.max(1, row.pdf_count)} value={row.pdf_ready} />
        <p>PDF {row.pdf_ready}/{row.pdf_count} · 강의계획서 {row.syllabus_detected ? "인식" : "미확인"} · 진도 상세 {row.detail_complete ? "확인 완료" : "추가 확인 필요"}</p>
        <p className="text-gray-600">{researchLabels[row.research_status] ?? "검색 상태 미확인"}{row.pending_steps > 0 ? ` · 남은 단계 ${row.pending_steps}` : ""}</p>
        {row.knowledge.context_truncated && <p className="text-gray-600">추천 반영 범위: 현재 진도 중심의 일부 자료</p>}
        {!row.pdf_count && <p className="text-amber-800">이 목표에 연결된 PDF가 없습니다. 기존 진도·학습 기록만으로 임시 추천합니다.</p>}
        {row.warnings.length > 0 && <p className="text-amber-800">진도와 노트 페이지를 확인해 주세요. 불명확한 범위는 상세 분석 완료로 간주하지 않습니다.</p>}
        {row.failed_steps.map((step) => <p key={step.id} className="text-red-700">{step.message}</p>)}
        {!!row.sources?.length && <div className="flex flex-wrap gap-2">
          <select aria-label={`${row.title} 재분석할 PDF`} className="min-w-0 max-w-full flex-1 border rounded px-2 py-1" disabled={busy} value={chosenNotes[id] ?? row.sources[0].id} onChange={(e) => setChosenNotes((current) => ({ ...current, [id]: e.target.value }))}>
            {row.sources.map((source) => <option key={source.id} value={source.id}>{source.title}</option>)}
          </select>
          <button type="button" disabled={busy} title="선택한 PDF만 새로 분석하고 이전 결과는 보존" className="inline-flex items-center gap-1 border rounded px-2 py-1 disabled:opacity-50" onClick={() => onRefresh(id, chosenNotes[id] ?? row.sources![0].id)}><RefreshCw size={14} /> 이 PDF 재분석</button>
        </div>}
        <details><summary className="cursor-pointer font-medium">내용·학습 근거</summary><div className="pt-2 space-y-3 break-words">
          {!!row.knowledge.syllabus_facts?.length && <div><h4 className="font-semibold">강의계획서 기준 교육과정</h4>
            {row.knowledge.syllabus_facts.filter((fact) => fact.field === "weekly_schedule" || fact.field === "objectives" || fact.field === "assessment").map((fact, i) => <p key={i}>{fact.value} ({fact.page}쪽)</p>)}
          </div>}
          {row.actual_progress.map((p) => <p key={p.id}>실제 수업 {p.date} · {p.title || "주제 미기록"} · {p.mapped ? "자료 범위 연결됨" : "자료 범위 확인 필요"}</p>)}
          {row.knowledge.content.map((item) => <div key={item.artifact_id}><p className="text-gray-600">PDF {item.pages.join("–")}쪽 · {item.kind === "detail" ? "상세" : "구조"} 분석</p>
            {item.content.units.slice(0, 5).map((unit, i) => <p key={i}><strong>{unit.title}</strong> · {unit.required_depth}<br />{unit.methods.join(" · ")}</p>)}
            {item.content.syllabus.filter((fact) => fact.field === "weekly_schedule").map((fact, i) => <p key={i}>예정 교육과정 ({fact.page}쪽): {fact.value}</p>)}
          </div>)}
          {row.knowledge.research.map((item) => <div key={item.artifact_id}>
            <p>{item.content.required_depth}</p><p>{item.content.minutes_low !== null ? `단원 자율학습 추정 ${item.content.minutes_low}–${item.content.minutes_high}분` : "학습 시간 근거 부족"}</p>
            <p>{item.content.time_basis}</p><p className="text-gray-600">{item.content.uncertainty}</p>
            {item.content.sources.map((s) => <p key={s.url}><a className="text-blue-700 underline inline-flex items-center gap-1" href={s.url} target="_blank" rel="noopener noreferrer">{s.title}<ExternalLink size={12} /></a> · {s.checked_at.slice(0, 10)}<br />{s.relevance}</p>)}
          </div>)}
        </div></details>
      </div>;
    })}
  </section>;
}
