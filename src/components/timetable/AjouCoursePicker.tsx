"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpen, Check, Plus, Search, ShoppingBag, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { SCHEDULE_COLORS } from "@/lib/schedule-colors";
import { AJOU_TERM, courseSchedules, matchesCatalogSearch, prepareSection, sameCatalogSubject, schedulesOverlap, sectionToCourse, type ParsedSection } from "@/lib/ajou-catalog";
import type { Course, DayOfWeek } from "@/lib/types";
import type { WorkSchedule } from "@/lib/timetable-storage";

const DAYS: DayOfWeek[] = ["월", "화", "수", "목", "금", "토", "일"];
const toMinutes = (time: string) => Number(time.split(":")[0]) * 60 + Number(time.split(":")[1]);

function Preview({ courses, workSchedules }: { courses: Course[]; workSchedules: WorkSchedule[] }) {
  const entries = [
    ...courses.flatMap((course) => courseSchedules(course).map((schedule) => ({ ...schedule, name: course.name, color: course.color, id: course.id }))),
    ...workSchedules.flatMap((work) => courseSchedules(work).map((schedule) => ({ ...schedule, name: work.title, color: work.color, id: work.id }))),
  ];
  const startHour = Math.min(8, ...entries.map((e) => Math.floor(toMinutes(e.startTime) / 60)));
  const endHour = Math.max(20, ...entries.map((e) => Math.ceil(toMinutes(e.endTime) / 60)));
  const height = (endHour - startHour) * 30;
  return (
    <div className="overflow-x-auto rounded-xl border bg-white p-2" aria-label="선택한 과목의 주간 시간표 미리보기">
      <div className="min-w-[320px]">
        <div className="ml-8 grid grid-cols-7 pb-2 text-center text-[11px] text-slate-500">{DAYS.map((d) => <span key={d}>{d}</span>)}</div>
        <div className="flex">
          <div className="relative w-8 shrink-0" style={{ height }}>
            {Array.from({ length: endHour - startHour }, (_, i) => <span key={i} className="absolute text-[10px] text-slate-400" style={{ top: i * 30 }}>{startHour + i}시</span>)}
          </div>
          {DAYS.map((day) => <div key={day} className="relative flex-1 border-l" style={{ height, backgroundImage: "repeating-linear-gradient(to bottom, #e2e8f0 0, #e2e8f0 1px, transparent 1px, transparent 30px)" }}>
            {entries.filter((e) => e.day === day).map((e, index) => <div key={`${e.id}-${index}`} title={`${e.name} · ${e.startTime}–${e.endTime}${e.location ? ` · ${e.location}` : ""}`} className="absolute inset-x-0.5 overflow-hidden rounded px-1 py-1 text-[9px] leading-tight text-white" style={{ backgroundColor: e.color, top: (toMinutes(e.startTime) - startHour * 60) / 2, height: (toMinutes(e.endTime) - toMinutes(e.startTime)) / 2 }}>
              {e.name}
            </div>)}
          </div>)}
        </div>
      </div>
    </div>
  );
}

interface PickerProps {
  selectedTerm: string;
  existingCourses: Course[];
  workSchedules: WorkSchedule[];
  onApply: (courses: Course[]) => void;
}

function PickerBody({ selectedTerm, existingCourses, workSchedules, onApply, onClose }: PickerProps & { onClose: () => void }) {
  const [catalog, setCatalog] = useState<ParsedSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("");
  const [category, setCategory] = useState("");
  const [freeDay, setFreeDay] = useState("");
  const [onlyFits, setOnlyFits] = useState(false);
  const [englishOnly, setEnglishOnly] = useState(false);
  const [limit, setLimit] = useState(40);
  const [basket, setBasket] = useState<ParsedSection[]>([]);

  useEffect(() => {
    let active = true;
    import("@/data/ajou-2026-2.json")
      .then((data) => { if (active) setCatalog(data.courses.map(prepareSection)); })
      .catch(() => { if (active) setError("과목 목록을 불러오지 못했습니다. 다시 시도해주세요."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retry]);

  const departments = useMemo(() => [...new Set(catalog.map((c) => c.department))].filter(Boolean).sort((a, b) => a.localeCompare(b, "ko")), [catalog]);
  const additions = useMemo(() => basket.map((s, i) => sectionToCourse(s, SCHEDULE_COLORS[(existingCourses.length + i) % SCHEDULE_COLORS.length])), [basket, existingCourses.length]);
  const allCourses = [...existingCourses, ...additions];
  const creditTotal = allCourses.reduce((sum, c) => sum + c.credits, 0);

  function availability(section: ParsedSection) {
    if (existingCourses.some((c) => sameCatalogSubject(section, c))) return "이미 편성된 과목 / 다른 분반";
    if (additions.some((c) => sameCatalogSubject(section, c))) return "다른 분반을 선택했어요";
    if (section.scheduleWarning) return section.scheduleWarning;
    const conflict = allCourses.find((c) => schedulesOverlap(section.schedules, courseSchedules(c)));
    if (conflict) return `시간 겹침 · ${conflict.name}`;
    const work = workSchedules.find((w) => schedulesOverlap(section.schedules, courseSchedules(w)));
    if (work) return `시간 겹침 · ${work.title}`;
    return "";
  }

  const filtered = catalog.filter((section) =>
    matchesCatalogSearch(section, query) && (!department || section.department === department) &&
    (!category || section.category === category) && (!englishOnly || section.english) &&
    (!freeDay || (!section.scheduleWarning && !section.schedules.some((s) => s.day === freeDay))) &&
    (!onlyFits || basket.some((b) => b.registrationNumber === section.registrationNumber) || !availability(section)),
  );
  const visible = filtered.slice(0, limit);

  function toggle(section: ParsedSection) {
    setError("");
    if (basket.some((s) => s.registrationNumber === section.registrationNumber)) {
      setBasket((prev) => prev.filter((s) => s.registrationNumber !== section.registrationNumber));
    } else if (!availability(section)) setBasket((prev) => [...prev, section]);
  }

  function apply() {
    try {
      onApply(additions);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했습니다. 다시 시도해주세요.");
    }
  }

  const selectStyle = "h-10 min-w-0 rounded-lg border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-blue-500";
  return <>
    <DialogHeader className="pr-8">
      <DialogTitle className="text-xl font-semibold">아주대학교 과목으로 시간표 만들기</DialogTitle>
      <DialogDescription>2026년 2학기 · 9월 2일 개설 현황 · 학교 수강신청과는 별도의 시간표 편성입니다.</DialogDescription>
    </DialogHeader>
    {selectedTerm !== AJOU_TERM && <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800">추가하면 {AJOU_TERM} 시간표로 이동합니다. 다른 학기 시간표는 유지됩니다.</p>}
    {error && <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}{!catalog.length && !loading && <Button variant="outline" size="sm" className="ml-3" onClick={() => { setError(""); setLoading(true); setRetry((n) => n + 1); }}>다시 시도</Button>}</div>}
    <div className="min-h-0 flex-1 overflow-y-auto lg:grid lg:grid-cols-[1.25fr_1fr] lg:gap-5 lg:overflow-hidden">
      <section className="flex min-h-0 flex-col" aria-label="개설 과목 검색">
        <div className="space-y-3 pb-3">
          <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><Input autoFocus aria-label="과목 검색" value={query} onChange={(e) => { setQuery(e.target.value); setLimit(40); }} placeholder="과목명, 교수님, 수강번호, 과목코드 검색" className="h-11 pl-9" /></div>
          <div className="grid grid-cols-3 gap-2">
            <select aria-label="개설 학과" className={selectStyle} value={department} onChange={(e) => { setDepartment(e.target.value); setLimit(40); }}><option value="">전체 학과</option>{departments.map((d) => <option key={d}>{d}</option>)}</select>
            <select aria-label="이수 구분" className={selectStyle} value={category} onChange={(e) => { setCategory(e.target.value); setLimit(40); }}><option value="">전체 이수구분</option>{["전필", "전선", "전기", "교필", "교선", "일선"].map((c) => <option key={c}>{c}</option>)}</select>
            <select aria-label="공강 희망 요일" className={selectStyle} value={freeDay} onChange={(e) => { setFreeDay(e.target.value); setLimit(40); }}><option value="">공강 요일</option>{DAYS.map((d) => <option key={d} value={d}>{d}요일 비우기</option>)}</select>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
            <label className="flex items-center gap-2"><input type="checkbox" checked={onlyFits} onChange={(e) => { setOnlyFits(e.target.checked); setLimit(40); }} />추가 가능한 과목만</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={englishOnly} onChange={(e) => { setEnglishOnly(e.target.checked); setLimit(40); }} />영어강의</label>
            <button className="ml-auto underline underline-offset-2" onClick={() => { setQuery(""); setDepartment(""); setCategory(""); setFreeDay(""); setOnlyFits(false); setEnglishOnly(false); setLimit(40); }}>필터 초기화</button>
          </div>
          <p role="status" className="text-xs text-slate-500">{loading ? "과목 목록을 불러오는 중…" : `검색 결과 ${filtered.length.toLocaleString()}개 / 전체 ${catalog.length.toLocaleString()}개 강좌`}</p>
        </div>
        <div className="space-y-2 pb-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-2">
          {!loading && !filtered.length && <div className="rounded-xl border border-dashed p-10 text-center text-sm text-slate-500">조건에 맞는 과목이 없습니다. 검색어나 필터를 바꿔보세요.</div>}
          {visible.map((section) => {
            const picked = basket.some((b) => b.registrationNumber === section.registrationNumber);
            const reason = picked ? "" : availability(section);
            return <article key={section.registrationNumber} className={`rounded-xl border p-4 ${picked ? "border-blue-400 bg-blue-50/60" : "bg-white"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500"><span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">{section.category}</span><span>{section.credits}학점</span><span>수강번호 {section.registrationNumber}</span>{section.english && <span className="text-blue-700">영어강의</span>}</div><h3 className="mt-1.5 font-semibold leading-snug text-slate-900">{section.name}</h3><p className="mt-1 text-xs text-slate-500">{section.professor || "교수 미정"} · {section.department} · {section.courseCode}</p></div>
                <Button size="sm" variant={picked ? "secondary" : "outline"} disabled={Boolean(reason)} onClick={() => toggle(section)} aria-label={`${section.registrationNumber} ${picked ? "선택 취소" : "담기"}`} className="shrink-0">{picked ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{picked ? "선택됨" : "담기"}</Button>
              </div>
              <div className="mt-3 space-y-1 text-xs text-slate-700">{section.schedules.map((s, i) => <p key={i}>{s.day} {s.startTime}–{s.endTime} <span className="text-slate-500">{s.location || "강의실 미정"}</span></p>)}</div>
              <p className="mt-2 break-words text-[11px] text-slate-500">원본: {section.rawSchedule || "강의시간 미기재"}</p>
              {(section.targetYear || section.teachingMode) && <p className="mt-1 text-[11px] text-slate-500">{[section.targetYear, section.teachingMode].filter(Boolean).join(" · ")}</p>}
              {(section.internationalOnly || section.priorityEnrollment) && <p className="mt-2 text-[11px] text-amber-700">{[section.internationalOnly && "유학생 전용", section.priorityEnrollment && "분반별 우선수강 대상 확인"].filter(Boolean).join(" · ")}</p>}
              {reason && <p className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">{reason}</p>}
            </article>;
          })}
          {filtered.length > limit && <Button variant="outline" className="w-full" onClick={() => setLimit((n) => n + 40)}>40개 더 보기 ({filtered.length - limit}개 남음)</Button>}
        </div>
      </section>
      <aside className="space-y-3 border-t pt-4 lg:overflow-y-auto lg:border-0 lg:pt-0" aria-label="시간표 편성 미리보기">
        <div className="flex items-center justify-between"><h3 className="flex items-center gap-2 font-semibold"><ShoppingBag className="h-4 w-4 text-blue-600" />선택 과목 {basket.length}개</h3><span className="text-sm font-semibold text-blue-700">편성 후 총 {creditTotal}학점</span></div>
        <p className="text-xs text-slate-500">기존 {existingCourses.length}개 + 선택 {basket.length}개 · 기존 수업과 기타 일정도 함께 표시합니다.</p>
        {freeDay && (allCourses.some((c) => courseSchedules(c).some((s) => s.day === freeDay)) || workSchedules.some((w) => courseSchedules(w).some((s) => s.day === freeDay))) && <p className="text-xs text-amber-700">{freeDay}요일에 이미 일정이 있습니다. 공강 필터는 검색 결과에만 적용됩니다.</p>}
        <Preview courses={allCourses} workSchedules={workSchedules} />
        {basket.length === 0 ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">왼쪽에서 원하는 분반을 담아보세요. 시간이 겹치거나 같은 과목의 다른 분반이면 알려드립니다.</p> : <ul className="space-y-2">{basket.map((s) => <li key={s.registrationNumber} className="flex items-center justify-between gap-2 rounded-lg bg-blue-50 px-3 py-2 text-sm"><span>{s.name} <span className="text-xs text-slate-500">{s.registrationNumber} · {s.credits}학점</span></span><button aria-label={`${s.registrationNumber} 선택 제거`} className="rounded p-1 hover:bg-blue-100" onClick={() => toggle(s)}><X className="h-4 w-4" /></button></li>)}</ul>}
        <p className="text-[11px] leading-relaxed text-slate-500">시간 미기재 강좌는 자동 배치하지 않습니다. 강의시간·수강 자격·정원은 학교 포털에서 최종 확인해주세요. 숫자 교시는 50분, 영문 교시는 75분으로 변환하며 연속 교시는 휴식 시간을 포함해 묶습니다.</p>
      </aside>
    </div>
    <div className="flex shrink-0 items-center justify-between gap-3 border-t pt-3">
      <span className="text-xs text-slate-500">선택한 과목만 추가 · 기존 시간표 유지</span>
      <Button disabled={!basket.length} onClick={apply}>{basket.length}개 과목 시간표에 추가</Button>
    </div>
  </>;
}

export function AjouCoursePicker(props: PickerProps) {
  const [open, setOpen] = useState(false);
  return <Dialog open={open} onOpenChange={setOpen}>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 px-5 py-4">
      <div className="flex items-center gap-3"><div className="rounded-xl bg-white p-2.5 text-blue-700"><BookOpen className="h-5 w-5" /></div><div><p className="font-semibold text-slate-900">아주대 2학기, 과목만 고르면 시간표 완성</p><p className="mt-1 text-xs text-slate-600">2026-09-02 개설 자료 · 교수·분반 검색 · 공강 필터 · 겹치는 시간 확인</p></div></div>
      <DialogTrigger render={<Button className="gap-2" />}><Search className="h-4 w-4" />아주대 과목 찾기</DialogTrigger>
    </div>
    <DialogContent className="flex h-[92dvh] max-h-[900px] flex-col overflow-hidden p-5 sm:max-w-6xl">
      {open && <PickerBody {...props} onClose={() => setOpen(false)} />}
    </DialogContent>
  </Dialog>;
}
