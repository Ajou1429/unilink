"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Calculator, Pencil, Plus, Trash2 } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SpecDialog, emptySpecDraft } from "@/components/records/SpecDialog";
import { GpaLineChart } from "@/components/records/GradeCharts";
import {
  formatGpa,
  getGradeRecords,
  getGradeSettings,
  getSpecRecords,
  gradeTerms,
  hasRetakePlan,
  STANDARD_GRADE_TERMS,
  summarizeTerm,
  MAX_GPA,
  RECORDS_CHANGED_EVENT,
  saveSpecRecords,
  SPEC_CATEGORY_LABELS,
  summarizeGrades,
  type GradeRecord,
  type SpecCategory,
  type SpecRecord,
} from "@/lib/record-storage";

const CATEGORY_STYLES: Record<SpecCategory, string> = {
  certificate: "bg-blue-50 text-blue-700",
  language: "bg-violet-50 text-violet-700",
  competition: "bg-amber-50 text-amber-700",
  other: "bg-slate-100 text-slate-700",
};

function formatMonth(value?: string) {
  if (!value) return "";
  const [year, month] = value.split("-");
  return month ? `${year}.${month}` : year;
}

function specDetail(spec: SpecRecord) {
  const parts: string[] = [];
  if (spec.category === "certificate" || spec.category === "language") {
    if (spec.acquiredAt) parts.push(`${formatMonth(spec.acquiredAt)} 취득`);
    if (spec.lifetime) parts.push("평생");
    else if (spec.expiresAt) parts.push(`${formatMonth(spec.expiresAt)} 만료`);
  }
  if (spec.category === "language" && spec.score) parts.unshift(spec.score);
  if ((spec.category === "certificate" || spec.category === "competition") && spec.issuer) parts.push(spec.issuer);
  if (spec.category === "competition" && spec.award) parts.unshift(spec.award);
  if (spec.category === "other" && spec.content) parts.push(spec.content);
  return parts.join(" · ");
}

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-xl bg-muted/40 p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-bold">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export default function RecordsPage() {
  const [grades, setGrades] = useState<GradeRecord[]>([]);
  const [requiredCredits, setRequiredCredits] = useState(150);
  const [extraTerms, setExtraTerms] = useState<string[]>([]);
  const [specs, setSpecs] = useState<SpecRecord[]>([]);
  const [dialog, setDialog] = useState<{ open: boolean; editing: SpecRecord | null; category: SpecCategory }>({
    open: false, editing: null, category: "certificate",
  });

  useEffect(() => {
    function sync() {
      setGrades(getGradeRecords());
      const settings = getGradeSettings();
      setRequiredCredits(settings.requiredCredits);
      setExtraTerms(settings.extraTerms);
      setSpecs(getSpecRecords());
    }
    const timeout = window.setTimeout(sync, 0);
    window.addEventListener(RECORDS_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener(RECORDS_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const summary = summarizeGrades(grades);
  const retake = summarizeGrades(grades, true);
  const showRetake = hasRetakePlan(grades);
  const progress = Math.min(summary.earnedCredits / requiredCredits, 1);
  const chartPoints = gradeTerms(grades, extraTerms)
    .map((term) => ({ term, ...summarizeTerm(grades, term) }))
    .filter((point) => STANDARD_GRADE_TERMS.includes(point.term) || point.gpa !== null);

  function persistSpecs(next: SpecRecord[]) {
    setSpecs(next);
    saveSpecRecords(next);
  }

  function saveSpec(draft: Omit<SpecRecord, "id" | "createdAt" | "updatedAt">) {
    const now = new Date().toISOString();
    const editing = dialog.editing;
    persistSpecs(
      editing
        ? specs.map((spec) => (spec.id === editing.id ? { ...spec, ...draft, updatedAt: now } : spec))
        : [{ ...draft, id: `spec-${Date.now()}`, createdAt: now, updatedAt: now }, ...specs],
    );
    setDialog((prev) => ({ ...prev, open: false, editing: null }));
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header title="성적 및 스펙" />
      <div className="mx-auto grid w-full max-w-6xl flex-1 gap-4 p-6 lg:h-[calc(100dvh-4rem)] lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:overflow-hidden">
        <Card className="flex min-h-0 flex-col border-0 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">나의 학점</CardTitle>
              <Button render={<Link href="/records/calculator" />} nativeButton={false} size="sm" className="gap-1.5">
                <Calculator className="h-4 w-4" /> 학점계산기
              </Button>
            </div>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 space-y-4 overflow-y-auto">
            <div className="grid gap-3 sm:grid-cols-3">
            <Stat
              label="전체 평점"
              value={<>{formatGpa(summary.gpa)} <span className="text-sm font-normal text-muted-foreground">/ {MAX_GPA}</span></>}
              sub={showRetake ? `재수강 시 ${formatGpa(retake.gpa)} / ${MAX_GPA}` : undefined}
            />
            <Stat
              label="전공 평점"
              value={<>{formatGpa(summary.majorGpa)} <span className="text-sm font-normal text-muted-foreground">/ {MAX_GPA}</span></>}
              sub={showRetake ? `재수강 시 ${formatGpa(retake.majorGpa)} / ${MAX_GPA}` : undefined}
            />
            <div>
              <Stat label="취득 학점" value={<>{summary.earnedCredits} <span className="text-sm font-normal text-muted-foreground">/ {requiredCredits}</span></>} />
              <div className="mt-2 h-1.5 rounded-full bg-muted" role="progressbar" aria-valuenow={summary.earnedCredits} aria-valuemax={requiredCredits} aria-label="졸업 학점 진행">
                <div className="h-1.5 rounded-full bg-primary" style={{ width: `${progress * 100}%` }} />
              </div>
            </div>
            </div>
            <GpaLineChart points={chartPoints} />
          </CardContent>
        </Card>

        <Card className="flex min-h-0 flex-col border-0 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">스펙</CardTitle>
              <Button size="sm" className="gap-1" onClick={() => setDialog({ open: true, editing: null, category: "certificate" })}>
                <Plus className="h-4 w-4" /> 스펙 추가
              </Button>
            </div>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-y-auto">
            {specs.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">등록한 스펙이 없어요.</p>
            ) : (
              <ul className="grid gap-2">
                {specs.map((spec) => (
                  <li key={spec.id} className="group flex items-start gap-3 rounded-lg border p-3">
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold ${CATEGORY_STYLES[spec.category]}`}>
                      {SPEC_CATEGORY_LABELS[spec.category]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm font-medium">{spec.title}</p>
                      {specDetail(spec) && <p className="mt-0.5 line-clamp-2 break-words text-xs text-muted-foreground">{specDetail(spec)}</p>}
                    </div>
                    <div className="flex shrink-0 opacity-60 transition-opacity group-hover:opacity-100">
                      <Button size="icon-sm" variant="ghost" aria-label={`${spec.title} 수정`} onClick={() => setDialog({ open: true, editing: spec, category: spec.category })}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`${spec.title} 삭제`}
                        onClick={() => window.confirm(`${spec.title}을(를) 삭제할까요?`) && persistSpecs(specs.filter((item) => item.id !== spec.id))}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <SpecDialog
        open={dialog.open}
        editing={Boolean(dialog.editing)}
        initial={dialog.editing ? { ...emptySpecDraft(), ...dialog.editing } : emptySpecDraft(dialog.category)}
        onOpenChange={(open) => setDialog((prev) => ({ ...prev, open, editing: open ? prev.editing : null }))}
        onSubmit={saveSpec}
      />
    </div>
  );
}
