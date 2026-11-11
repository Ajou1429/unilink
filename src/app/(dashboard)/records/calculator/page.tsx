"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarDays, Plus, Trash2, X } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { GpaLineChart, GradeDistribution } from "@/components/records/GradeCharts";
import { getAllStoredCourses, COURSES_CHANGED_EVENT } from "@/lib/course-storage";
import { getCurrentAcademicTermLabel, sortAcademicTerms } from "@/lib/academic-term";
import {
  formatGpa,
  getGradeRecords,
  getGradeSettings,
  GRADE_OPTIONS,
  gradeDistribution,
  gradeTerms,
  hasRetakePlan,
  MAX_GPA,
  RECORDS_CHANGED_EVENT,
  saveGradeRecords,
  saveGradeSettings,
  STANDARD_GRADE_TERMS,
  summarizeGrades,
  summarizeTerm,
  supersededIds,
  clearCompletedRetakes,
  formatGradeTerm,
  GRADE_TERM_SEASONS,
  MAX_GRADE_YEAR,
  type GradeTermSeason,
  type GradeRecord,
  type GradeValue,
} from "@/lib/record-storage";
import type { Course } from "@/lib/types";

function makeId() {
  return `grade-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const selectClass =
  "h-8 rounded-md border bg-white px-1.5 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50";

function GradeSelect({ value, onChange, label, disabled }: { value: GradeValue | ""; onChange: (value: GradeValue | "") => void; label: string; disabled?: boolean }) {
  return (
    <select aria-label={label} className={`${selectClass} w-16`} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value as GradeValue | "")}>
      <option value="">-</option>
      {GRADE_OPTIONS.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
    </select>
  );
}

function SummaryTile({ label, children, sub }: { label: string; children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-1 text-2xl font-bold">{children}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

export default function GradeCalculatorPage() {
  const [records, setRecords] = useState<GradeRecord[]>([]);
  const [requiredCredits, setRequiredCredits] = useState(150);
  const [requiredDraft, setRequiredDraft] = useState("150");
  const [extraTerms, setExtraTerms] = useState<string[]>([]);
  const [termOpen, setTermOpen] = useState(false);
  const [newTerm, setNewTerm] = useState<{ year: number; season: GradeTermSeason }>({ year: 1, season: "여름학기" });
  const [selectedTerm, setSelectedTerm] = useState(STANDARD_GRADE_TERMS[0]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [importTerm, setImportTerm] = useState(getCurrentAcademicTermLabel());

  useEffect(() => {
    function sync() {
      setRecords(getGradeRecords());
      const settings = getGradeSettings();
      setRequiredCredits(settings.requiredCredits);
      setRequiredDraft(String(settings.requiredCredits));
      setExtraTerms(settings.extraTerms);
      setCourses(getAllStoredCourses());
    }
    const timeout = window.setTimeout(sync, 0);
    window.addEventListener(RECORDS_CHANGED_EVENT, sync);
    window.addEventListener(COURSES_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener(RECORDS_CHANGED_EVENT, sync);
      window.removeEventListener(COURSES_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const terms = gradeTerms(records, extraTerms);
  const superseded = supersededIds(records);
  const termRecords = records.filter((record) => record.term === selectedTerm);
  const total = summarizeGrades(records);
  const totalRetake = summarizeGrades(records, true);
  const showRetake = hasRetakePlan(records);
  const termSummary = summarizeTerm(records, selectedTerm);
  const chartPoints = terms
    .map((term) => ({ term, ...summarizeTerm(records, term) }))
    .filter((point) => STANDARD_GRADE_TERMS.includes(point.term) || point.gpa !== null);
  const distribution = gradeDistribution(records);
  const timetableTerms = useMemo(
    () => sortAcademicTerms([getCurrentAcademicTermLabel(), ...courses.map((course) => course.term).filter(Boolean) as string[]]),
    [courses],
  );

  function persist(next: GradeRecord[]) {
    // 나중 학기에 같은 과목 성적이 들어오면 앞 학기의 "재수강 예정"은 자동으로 끈다
    const resolved = clearCompletedRetakes(next);
    setRecords(resolved);
    saveGradeRecords(resolved);
  }

  function saveExtraTerms(next: string[]) {
    setExtraTerms(next);
    saveGradeSettings({ requiredCredits, extraTerms: next });
  }

  function addTerm() {
    const term = formatGradeTerm(newTerm.year, newTerm.season);
    if (!terms.includes(term)) saveExtraTerms([...extraTerms, term]);
    setSelectedTerm(term);
    setTermOpen(false);
  }

  function removeTerm(term: string) {
    saveExtraTerms(extraTerms.filter((item) => item !== term));
    setSelectedTerm(STANDARD_GRADE_TERMS[0]);
  }

  function update(id: string, patch: Partial<GradeRecord>) {
    persist(records.map((record) => (record.id === id ? { ...record, ...patch, updatedAt: new Date().toISOString() } : record)));
  }

  function addRow() {
    const now = new Date().toISOString();
    persist([...records, { id: makeId(), term: selectedTerm, courseName: "", credits: 3, grade: "", courseType: "major", retake: false, retakeGrade: "", createdAt: now, updatedAt: now }]);
  }

  function importTimetable() {
    const now = new Date().toISOString();
    const existing = new Set(termRecords.map((record) => record.courseId).filter(Boolean));
    const additions = courses
      .filter((course) => course.term === importTerm && !existing.has(course.id))
      .map((course): GradeRecord => ({
        id: makeId(), term: selectedTerm, courseId: course.id, courseName: course.name, credits: course.credits,
        courseType: course.courseType ?? "major", grade: "", retake: false, retakeGrade: "", createdAt: now, updatedAt: now,
      }));
    persist([...records, ...additions]);
    setImportOpen(false);
  }

  function commitRequired() {
    const value = Number(requiredDraft);
    if (Number.isInteger(value) && value > 0 && value <= 300) {
      setRequiredCredits(value);
      saveGradeSettings({ requiredCredits: value, extraTerms });
    } else setRequiredDraft(String(requiredCredits));
  }

  const importCount = courses.filter((course) => course.term === importTerm).length;

  return (
    <div className="flex min-h-screen flex-col">
      <Header title="학점계산기" />
      <div className="mx-auto w-full max-w-6xl flex-1 space-y-4 p-6">
        <div className="flex items-center gap-2">
          <Button render={<Link href="/records" />} nativeButton={false} variant="ghost" size="sm" className="gap-1">
            <ArrowLeft className="h-4 w-4" /> 성적 및 스펙
          </Button>
        </div>

        <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="학기 선택">
          {terms.map((term) => {
            const has = records.some((record) => record.term === term);
            return (
              <button
                key={term}
                type="button"
                role="tab"
                aria-selected={term === selectedTerm}
                onClick={() => setSelectedTerm(term)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                  term === selectedTerm ? "border-slate-800 bg-slate-800 text-white" : has ? "bg-white text-foreground hover:bg-muted" : "bg-white text-muted-foreground hover:bg-muted"
                }`}
              >
                {term}
              </button>
            );
          })}
        </div>
          <Dialog open={termOpen} onOpenChange={setTermOpen}>
            <DialogTrigger render={<Button variant="outline" size="icon-sm" className="mt-0.5 shrink-0 rounded-full bg-white" aria-label="학기 추가" title="학기 추가" />}>
              <Plus className="h-4 w-4" />
            </DialogTrigger>
            <DialogContent className="max-w-xs">
              <DialogHeader><DialogTitle>학기 추가</DialogTitle></DialogHeader>
              <div className="grid grid-cols-2 gap-2">
                <select aria-label="학년" className={`${selectClass} h-9 w-full`} value={newTerm.year} onChange={(event) => setNewTerm((prev) => ({ ...prev, year: Number(event.target.value) }))}>
                  {Array.from({ length: MAX_GRADE_YEAR }, (_, index) => index + 1).map((year) => <option key={year} value={year}>{year}학년</option>)}
                </select>
                <select aria-label="학기" className={`${selectClass} h-9 w-full`} value={newTerm.season} onChange={(event) => setNewTerm((prev) => ({ ...prev, season: event.target.value as GradeTermSeason }))}>
                  {GRADE_TERM_SEASONS.map((season) => <option key={season} value={season}>{season}</option>)}
                </select>
              </div>
              <Button onClick={addTerm}>{terms.includes(formatGradeTerm(newTerm.year, newTerm.season)) ? "이 학기로 이동" : "추가"}</Button>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <SummaryTile
            label="전체 평점"
            sub={showRetake ? `재수강 시 ${formatGpa(totalRetake.gpa)} / ${MAX_GPA}` : undefined}
          >
            {formatGpa(total.gpa)} <span className="text-sm font-normal text-muted-foreground">/ {MAX_GPA}</span>
          </SummaryTile>
          <SummaryTile label="전공 평점" sub={showRetake ? `재수강 시 ${formatGpa(totalRetake.majorGpa)} / ${MAX_GPA}` : undefined}>
            {formatGpa(total.majorGpa)} <span className="text-sm font-normal text-muted-foreground">/ {MAX_GPA}</span>
          </SummaryTile>
          <SummaryTile label="취득 학점">
            <span className="flex items-baseline gap-1">
              {total.earnedCredits}
              <span className="text-sm font-normal text-muted-foreground">/</span>
              <input
                aria-label="졸업 필요 학점"
                inputMode="numeric"
                value={requiredDraft}
                onChange={(event) => setRequiredDraft(event.target.value.replace(/\D/g, ""))}
                onBlur={commitRequired}
                onKeyDown={(event) => event.key === "Enter" && (event.target as HTMLInputElement).blur()}
                className="w-14 rounded border border-transparent bg-transparent px-1 text-sm font-normal text-muted-foreground hover:border-input focus:border-input focus:outline-none"
              />
            </span>
          </SummaryTile>
        </div>

        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <GpaLineChart points={chartPoints} />
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2"><CardTitle className="text-sm">학점 비율</CardTitle></CardHeader>
            <CardContent><GradeDistribution items={distribution} /></CardContent>
          </Card>
        </div>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">
                {selectedTerm}
                {termSummary.gpa !== null && <span className="ml-2 text-sm font-normal text-muted-foreground">평점 {formatGpa(termSummary.gpa)} · {termSummary.earnedCredits}학점</span>}
                {extraTerms.includes(selectedTerm) && termRecords.length === 0 && (
                  <Button variant="ghost" size="icon-sm" className="ml-1 align-middle" aria-label="학기 삭제" title="학기 삭제" onClick={() => removeTerm(selectedTerm)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </CardTitle>
              <div className="flex gap-2">
                <Dialog open={importOpen} onOpenChange={setImportOpen}>
                  <DialogTrigger render={<Button variant="outline" size="sm" className="gap-1" />}>
                    <CalendarDays className="h-4 w-4" /> 시간표 불러오기
                  </DialogTrigger>
                  <DialogContent className="max-w-sm">
                    <DialogHeader><DialogTitle>시간표 불러오기</DialogTitle></DialogHeader>
                    <select aria-label="불러올 시간표" className={`${selectClass} h-9 w-full`} value={importTerm} onChange={(event) => setImportTerm(event.target.value)}>
                      {timetableTerms.map((term) => <option key={term} value={term}>{term}</option>)}
                    </select>
                    <Button disabled={!importCount} onClick={importTimetable}>
                      {importCount ? `${importCount}개 과목을 ${selectedTerm}에 추가` : "과목이 없는 시간표입니다"}
                    </Button>
                  </DialogContent>
                </Dialog>
                <Button size="sm" className="gap-1" onClick={addRow}><Plus className="h-4 w-4" /> 과목 추가</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {termRecords.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">시간표를 불러오거나 과목을 추가하세요.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="py-2 pr-2 font-medium">과목명</th>
                      <th className="w-16 px-1 font-medium">학점</th>
                      <th className="w-20 px-1 font-medium">성적</th>
                      <th className="w-12 px-1 text-center font-medium">전공</th>
                      <th className="w-40 px-1 font-medium">재수강 예정</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {termRecords.map((record) => (
                      <tr key={record.id} className={`border-b last:border-0 ${superseded.has(record.id) ? "opacity-50" : ""}`} title={superseded.has(record.id) ? "재수강한 성적으로 대체되어 계산에서 빠졌어요" : undefined}>
                        <td className="py-1.5 pr-2">
                          <Input aria-label="과목명" className="h-8" value={record.courseName} onChange={(event) => update(record.id, { courseName: event.target.value })} />
                        </td>
                        <td className="px-1">
                          <Input
                            aria-label="학점"
                            className="h-8 w-14"
                            inputMode="decimal"
                            value={String(record.credits)}
                            onChange={(event) => {
                              const value = Number(event.target.value);
                              if (event.target.value === "" || (Number.isFinite(value) && value >= 0 && value <= 30)) update(record.id, { credits: event.target.value === "" ? 0 : value });
                            }}
                          />
                        </td>
                        <td className="px-1"><GradeSelect label="성적" value={record.grade} onChange={(grade) => update(record.id, { grade })} /></td>
                        <td className="px-1 text-center">
                          <input type="checkbox" aria-label="전공" checked={record.courseType !== "non-major"} onChange={(event) => update(record.id, { courseType: event.target.checked ? "major" : "non-major" })} />
                        </td>
                        <td className="px-1">
                          <div className="flex items-center gap-2">
                            <input type="checkbox" aria-label="재수강 예정" checked={Boolean(record.retake)} onChange={(event) => update(record.id, event.target.checked
                              ? { retake: true, retakeGrade: record.retakeGrade || "A0" }
                              : { retake: false, retakeGrade: "" })} />
                            {record.retake && <GradeSelect label="재수강 예상 성적" value={record.retakeGrade ?? ""} onChange={(retakeGrade) => update(record.id, { retakeGrade })} />}
                          </div>
                        </td>
                        <td className="text-right">
                          <Button size="icon-sm" variant="ghost" aria-label="삭제" onClick={() => persist(records.filter((item) => item.id !== record.id))}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
