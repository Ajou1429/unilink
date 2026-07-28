"use client";

import { useEffect, useRef, useState } from "react";
import { Upload, Plus, Loader2, Trash2, FileText, BookMarked, X } from "lucide-react";
import { Header } from "@/components/layout/Header";
import {
  createSubject,
  deleteProblem,
  listProblems,
  listSubjects,
  setProblemLevel,
  uploadPDF,
  ProblemBankProblem,
  ProblemBankSubject,
} from "@/lib/problem-bank-storage";

// 원본: Ajou1429/problembank의 frontend/src/App.jsx를 그대로 포팅.
// mastery scale (0–5)
const LEVELS = [
  { v: 0, name: "미학습", desc: "아직 공부 안 함" },
  { v: 1, name: "읽음", desc: "문제만 읽어봄" },
  { v: 2, name: "답안풀이", desc: "답안 보고 풂" },
  { v: 3, name: "이해", desc: "답안 이해함" },
  { v: 4, name: "자력시도", desc: "답안 없이 혼자 풀기" },
  { v: 5, name: "마스터", desc: "문제 마스터" },
];
const RAMP = ["#CBD3DD", "#9DBF9E", "#7FB682", "#57A866", "#37984D", "#1E8B39"];
const EMPTY_SEG = "#EBEFF4";
const INK = "#1B2333";
const ACCENT = "#4F46E5";

function Meter({ level, onSet }: { level: number; onSet: (level: number) => void }) {
  return (
    <div className="flex items-center gap-[3px]">
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const filled = i <= level;
        const active = i === level;
        return (
          <button
            key={i}
            onClick={() => onSet(i)}
            title={`${i} · ${LEVELS[i].name}`}
            className="h-6 w-6 rounded-[5px] flex items-center justify-center text-[11px] font-semibold transition-all"
            style={{
              backgroundColor: filled ? RAMP[level] : EMPTY_SEG,
              color: filled ? (level >= 1 ? "#fff" : "#5B6472") : "#AEB6C2",
              boxShadow: active
                ? `0 0 0 2px #fff, 0 0 0 3.5px ${level >= 1 ? RAMP[level] : "#94A0B0"}`
                : "none",
            }}
          >
            {i}
          </button>
        );
      })}
    </div>
  );
}

export default function ProblemBankPage() {
  const [subjects, setSubjects] = useState<ProblemBankSubject[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [problems, setProblems] = useState<ProblemBankProblem[]>([]);
  const [ready, setReady] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const loadSubjects = async () => {
    const subs = await listSubjects();
    setSubjects(subs);
    return subs;
  };

  useEffect(() => {
    (async () => {
      try {
        const subs = await loadSubjects();
        if (subs.length) setActiveId(subs[0].id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "과목을 불러오지 못했습니다.");
      } finally {
        setReady(true);
      }
    })();
  }, []);

  useEffect(() => {
    const task = activeId ? listProblems(activeId) : Promise.resolve([]);
    task
      .then(setProblems)
      .catch((err) => setError(err instanceof Error ? err.message : "문제를 불러오지 못했습니다."));
  }, [activeId]);

  const active = subjects.find((s) => s.id === activeId) || null;

  const addSubject = async () => {
    const name = newSubject.trim();
    if (!name) return;
    try {
      const created = await createSubject(name);
      await loadSubjects();
      setActiveId(created.id);
      setNewSubject("");
      setAdding(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "과목을 추가하지 못했습니다.");
    }
  };

  const selectSubject = (id: string) => {
    setActiveId(id);
    setError("");
  };

  const setLevel = async (pid: string, lvl: number) => {
    setProblems((prev) => prev.map((p) => (p.id === pid ? { ...p, level: lvl } : p)));
    try {
      await setProblemLevel(pid, lvl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "이해도를 저장하지 못했습니다.");
      if (activeId) listProblems(activeId).then(setProblems);
    }
  };

  const removeProblem = async (pid: string) => {
    const prevProblems = problems;
    setProblems((prev) => prev.filter((p) => p.id !== pid));
    try {
      await deleteProblem(pid);
      setSubjects((prev) =>
        prev.map((s) => (s.id === activeId ? { ...s, count: Math.max(0, s.count - 1) } : s)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "문제를 삭제하지 못했습니다.");
      setProblems(prevProblems);
    }
  };

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !active) return;
    setBusy(true);
    setError("");
    try {
      const result = await uploadPDF(active.id, file);
      const fresh = await listProblems(active.id);
      setProblems(fresh);
      await loadSubjects();
      if (result.addedCount === 0) setError("새로 추가된 문제가 없어요. 이미 등록된 문제만 있었어요.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "PDF에서 문제를 읽지 못했어요. 다른 파일로 다시 시도해 주세요.",
      );
    } finally {
      setBusy(false);
    }
  };

  const stats = (() => {
    if (!active || problems.length === 0) return null;
    const n = problems.length;
    const mastered = problems.filter((p) => p.level === 5).length;
    const avg = problems.reduce((a, p) => a + p.level, 0) / n;
    return { n, mastered, avg };
  })();

  return (
    <div className="flex min-h-screen flex-col">
      <Header title="문제은행" />
      <main className="w-full flex-1 font-sans" style={{ backgroundColor: "#F6F7FA", color: INK }}>
        <div className="mx-auto max-w-3xl px-5 py-8">
          <div className="flex items-end justify-between gap-4">
            <div>
              <div
                className="flex items-center gap-2 text-[13px] font-medium tracking-wide"
                style={{ color: ACCENT }}
              >
                <BookMarked size={15} /> MASTERY LEDGER
              </div>
              <h1 className="mt-1 text-[26px] font-bold leading-tight">문제 이해도 원장</h1>
              <p className="mt-1 text-[13px] text-slate-500">
                PDF를 넣으면 문제를 잘라 목록으로 만들고, 각 문제의 이해도를 0–5로 기록합니다.
              </p>
            </div>
          </div>

          {!ready ? null : (
            <>
              <div className="mt-6 flex flex-wrap items-center gap-2">
                {subjects.map((s) => {
                  const on = s.id === activeId;
                  return (
                    <button
                      key={s.id}
                      onClick={() => selectSubject(s.id)}
                      className="rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-all border"
                      style={
                        on
                          ? { backgroundColor: INK, color: "#fff", borderColor: INK }
                          : { backgroundColor: "#fff", color: "#42506A", borderColor: "#DDE3EC" }
                      }
                    >
                      {s.name}
                      <span className="ml-1.5 opacity-60">{s.count}</span>
                    </button>
                  );
                })}
                {adding ? (
                  <div
                    className="flex items-center gap-1 rounded-full border bg-white pl-3 pr-1 py-1"
                    style={{ borderColor: ACCENT }}
                  >
                    <input
                      autoFocus
                      value={newSubject}
                      onChange={(e) => setNewSubject(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") addSubject();
                        if (e.key === "Escape") {
                          setAdding(false);
                          setNewSubject("");
                        }
                      }}
                      placeholder="과목명 (예: 전자기학)"
                      className="w-40 bg-transparent text-[13px] outline-none"
                    />
                    <button
                      onClick={addSubject}
                      className="rounded-full p-1 text-white"
                      style={{ backgroundColor: ACCENT }}
                    >
                      <Plus size={15} />
                    </button>
                    <button
                      onClick={() => {
                        setAdding(false);
                        setNewSubject("");
                      }}
                      className="rounded-full p-1 text-slate-400"
                    >
                      <X size={15} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setAdding(true)}
                    className="flex items-center gap-1 rounded-full border border-dashed px-3 py-1.5 text-[13px] font-medium text-slate-500 hover:text-slate-700"
                    style={{ borderColor: "#C4CCD8" }}
                  >
                    <Plus size={14} /> 과목 추가
                  </button>
                )}
              </div>

              {!active ? (
                <div
                  className="mt-10 rounded-2xl border border-dashed py-16 text-center"
                  style={{ borderColor: "#D2D9E3" }}
                >
                  <p className="text-[15px] font-medium">먼저 과목을 하나 만들어 주세요.</p>
                  <p className="mt-1 text-[13px] text-slate-500">
                    과목을 만들면 추출된 문제들이 그 과목의 하위 항목으로 등록됩니다.
                  </p>
                </div>
              ) : (
                <>
                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <input
                      ref={fileRef}
                      type="file"
                      accept="application/pdf"
                      onChange={onUpload}
                      className="hidden"
                    />
                    <button
                      onClick={() => fileRef.current?.click()}
                      disabled={busy}
                      className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-[14px] font-semibold text-white disabled:opacity-60"
                      style={{ backgroundColor: ACCENT }}
                    >
                      {busy ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                      {busy ? "문제 추출 중…" : "문제은행 PDF 넣기"}
                    </button>
                    {stats && (
                      <div className="flex items-center gap-4 text-[13px] text-slate-600">
                        <span>
                          <b style={{ color: INK }}>{stats.n}</b>문제
                        </span>
                        <span>
                          평균{" "}
                          <b style={{ color: RAMP[Math.round(stats.avg)] }}>{stats.avg.toFixed(1)}</b>
                        </span>
                        <span>
                          마스터 <b style={{ color: RAMP[5] }}>{stats.mastered}</b>
                        </span>
                      </div>
                    )}
                  </div>

                  {error && (
                    <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-700">
                      {error}
                    </div>
                  )}

                  <div
                    className="mt-5 overflow-hidden rounded-2xl border bg-white"
                    style={{ borderColor: "#E4E9F0" }}
                  >
                    {problems.length === 0 ? (
                      <div className="flex flex-col items-center gap-2 py-16 text-center">
                        <FileText size={28} className="text-slate-300" />
                        <p className="text-[14px] font-medium">아직 등록된 문제가 없어요.</p>
                        <p className="text-[13px] text-slate-500">
                          위 버튼으로 PDF를 넣으면 문제 목록이 만들어집니다.
                        </p>
                      </div>
                    ) : (
                      problems.map((p, i) => (
                        <div
                          key={p.id}
                          className="group flex items-center gap-3 px-4 py-3 border-t first:border-t-0"
                          style={{ borderColor: "#EEF1F6" }}
                        >
                          <div className="w-8 text-[12px] tabular-nums text-slate-400">
                            {String(i + 1).padStart(2, "0")}
                          </div>
                          <div
                            className="w-28 shrink-0 font-mono text-[14px] font-semibold"
                            style={{ color: INK }}
                          >
                            {p.label}
                          </div>
                          <div className="flex-1">
                            <Meter level={p.level} onSet={(l) => setLevel(p.id, l)} />
                          </div>
                          <div
                            className="hidden w-20 shrink-0 text-right text-[12px] sm:block"
                            style={{ color: RAMP[p.level] }}
                          >
                            {LEVELS[p.level].name}
                          </div>
                          <button
                            onClick={() => removeProblem(p.id)}
                            className="shrink-0 rounded-md p-1.5 text-slate-300 opacity-0 transition group-hover:opacity-100 hover:bg-slate-100 hover:text-rose-500"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5">
                    {LEVELS.map((l) => (
                      <div key={l.v} className="flex items-center gap-1.5 text-[12px] text-slate-500">
                        <span
                          className="inline-block h-3 w-3 rounded-[3px]"
                          style={{ backgroundColor: RAMP[l.v] }}
                        />
                        <b style={{ color: INK }}>{l.v}</b> {l.desc}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
