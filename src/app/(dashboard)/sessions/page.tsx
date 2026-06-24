"use client";

import { useState } from "react";
import { Header } from "@/components/layout/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BookOpen,
  Plus,
  Sparkles,
  CheckCircle2,
  Clock,
  Loader2,
  ExternalLink,
  ChevronRight,
  Brain,
  Highlighter,
  PenLine,
  BarChart3,
  Star,
  Calendar,
} from "lucide-react";
import { mockSessions, mockAnalyses, mockCourses } from "@/lib/mock-data";
import type { LectureSession, SessionAnalysis } from "@/lib/types";
interface AnalyzeResponse {
  progressSummary: string;
  conceptSummary: string;
  comprehensionScore: number;
  comprehensionNotes: string;
  teacherEmphasis: string;
  noteSummary: string;
  studyPlanSuggestion: string;
}

const STATUS_CONFIG = {
  done: { label: "분석 완료", color: "text-green-600 bg-green-50", icon: CheckCircle2 },
  processing: { label: "AI 분석 중", color: "text-blue-600 bg-blue-50", icon: Loader2 },
  pending: { label: "대기 중", color: "text-amber-600 bg-amber-50", icon: Clock },
  error: { label: "오류", color: "text-red-600 bg-red-50", icon: Clock },
} as const;

function StatusBadge({ status }: { status: LectureSession["status"] }) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${cfg.color}`}>
      <Icon className={`h-3 w-3 ${status === "processing" ? "animate-spin" : ""}`} />
      {cfg.label}
    </span>
  );
}

function ScoreMeter({ score }: { score: number }) {
  const color = score >= 80 ? "bg-green-500" : score >= 60 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-muted rounded-full h-1.5">
        <div className={`h-1.5 rounded-full transition-all ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-sm font-semibold tabular-nums">{score}</span>
    </div>
  );
}

function AnalysisView({ analysis }: { analysis: SessionAnalysis }) {
  return (
    <Tabs defaultValue="progress" className="mt-4">
      <TabsList className="bg-white border shadow-sm flex-wrap h-auto gap-1 p-1">
        <TabsTrigger value="progress" className="text-xs gap-1.5"><BookOpen className="h-3 w-3" />진도 정리</TabsTrigger>
        <TabsTrigger value="concept" className="text-xs gap-1.5"><Brain className="h-3 w-3" />개념 보충</TabsTrigger>
        <TabsTrigger value="comprehension" className="text-xs gap-1.5"><BarChart3 className="h-3 w-3" />이해도</TabsTrigger>
        <TabsTrigger value="emphasis" className="text-xs gap-1.5"><Highlighter className="h-3 w-3" />강조 내용</TabsTrigger>
        <TabsTrigger value="notes" className="text-xs gap-1.5"><PenLine className="h-3 w-3" />필기 정리</TabsTrigger>
      </TabsList>

      <TabsContent value="progress">
        <Card className="border-0 shadow-sm mt-3">
          <CardContent className="p-4">
            <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans">{analysis.progressSummary}</pre>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="concept">
        <Card className="border-0 shadow-sm mt-3">
          <CardContent className="p-4">
            <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans">{analysis.conceptSummary}</pre>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="comprehension">
        <Card className="border-0 shadow-sm mt-3">
          <CardContent className="p-4 space-y-4">
            <div>
              <p className="text-sm font-medium mb-2">이해도 점수</p>
              <ScoreMeter score={analysis.comprehensionScore} />
            </div>
            <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans">{analysis.comprehensionNotes}</pre>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="emphasis">
        <Card className="border-0 shadow-sm mt-3">
          <CardContent className="p-4">
            <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans">{analysis.teacherEmphasis}</pre>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="notes">
        <Card className="border-0 shadow-sm mt-3">
          <CardContent className="p-4">
            {analysis.noteSummary ? (
              <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans">{analysis.noteSummary}</pre>
            ) : (
              <p className="text-sm text-muted-foreground">추가 필기 메모 없음</p>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      {/* Study plan */}
      <Card className="border-0 shadow-sm mt-3 bg-primary/5">
        <CardContent className="p-4">
          <p className="text-sm font-semibold flex items-center gap-1.5 mb-2">
            <Star className="h-4 w-4 text-primary" /> 다음 복습 권장 계획
          </p>
          <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans">{analysis.studyPlanSuggestion}</pre>
          {analysis.driveUrl && (
            <a
              href={analysis.driveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary mt-3 hover:underline"
            >
              <ExternalLink className="h-3 w-3" /> Drive에서 정리본 보기
            </a>
          )}
        </CardContent>
      </Card>
    </Tabs>
  );
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<LectureSession[]>(mockSessions);
  const [analyses, setAnalyses] = useState<Record<string, SessionAnalysis>>(mockAnalyses);
  const [selected, setSelected] = useState<LectureSession | null>(sessions[0]);
  const [open, setOpen] = useState(false);
  const [analyzing, setAnalyzing] = useState<string | null>(null);

  const [newSession, setNewSession] = useState({
    courseId: "",
    week: String(new Date().getWeek?.() ?? 8),
    date: new Date().toISOString().slice(0, 10),
    slideText: "",
    highlightedText: "",
    extraNotes: "",
  });

  function createSession() {
    if (!newSession.courseId) return;
    const course = mockCourses.find((c) => c.id === newSession.courseId);
    const session: LectureSession = {
      id: `s${Date.now()}`,
      userId: "u1",
      courseId: newSession.courseId,
      courseName: course?.name ?? "",
      week: Number(newSession.week),
      date: newSession.date,
      slideText: newSession.slideText,
      highlightedText: newSession.highlightedText,
      extraNotes: newSession.extraNotes,
      status: "pending",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setSessions((prev) => [session, ...prev]);
    setSelected(session);
    setOpen(false);
    setNewSession({ courseId: "", week: "8", date: new Date().toISOString().slice(0, 10), slideText: "", highlightedText: "", extraNotes: "" });
  }

  async function runAnalysis(session: LectureSession) {
    setAnalyzing(session.id);
    setSessions((prev) => prev.map((s) => s.id === session.id ? { ...s, status: "processing" } : s));

    try {
      const res = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseName: session.courseName,
          week: session.week,
          slideText: session.slideText,
          highlightedText: session.highlightedText,
          extraNotes: session.extraNotes,
        }),
      });

      if (!res.ok) throw new Error("분석 실패");

      const result: AnalyzeResponse = await res.json();
      const analysis: SessionAnalysis = {
        id: `a${Date.now()}`,
        sessionId: session.id,
        ...result,
        createdAt: new Date().toISOString(),
      };

      setAnalyses((prev) => ({ ...prev, [session.id]: analysis }));
      setSessions((prev) => prev.map((s) => s.id === session.id ? { ...s, status: "done", updatedAt: new Date().toISOString() } : s));
      setSelected((prev) => prev?.id === session.id ? { ...prev, status: "done" } : prev);
    } catch {
      setSessions((prev) => prev.map((s) => s.id === session.id ? { ...s, status: "error" } : s));
    } finally {
      setAnalyzing(null);
    }
  }

  const selectedAnalysis = selected ? analyses[selected.id] : null;

  return (
    <div className="flex flex-col min-h-screen">
      <Header title="수업 세션" />
      <div className="flex-1 flex gap-0 overflow-hidden" style={{ height: "calc(100vh - 64px)" }}>

        {/* Left: session list */}
        <div className="w-80 shrink-0 border-r overflow-y-auto bg-white">
          <div className="p-4 border-b flex items-center justify-between sticky top-0 bg-white z-10">
            <div>
              <p className="text-sm font-semibold">세션 목록</p>
              <p className="text-xs text-muted-foreground">{sessions.length}개 세션</p>
            </div>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger render={<Button size="sm" className="gap-1.5" />}>
                <Plus className="h-3.5 w-3.5" /> 새 세션
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>새 수업 세션 시작</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>수업</Label>
                      <Select value={newSession.courseId} onValueChange={(v) => v && setNewSession((p) => ({ ...p, courseId: v }))}>
                        <SelectTrigger><SelectValue placeholder="수업 선택" /></SelectTrigger>
                        <SelectContent>
                          {mockCourses.map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>날짜</Label>
                      <Input type="date" value={newSession.date} onChange={(e) => setNewSession((p) => ({ ...p, date: e.target.value }))} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>슬라이드 텍스트 (선택)</Label>
                    <Textarea rows={3} placeholder="슬라이드에서 복사한 텍스트..." value={newSession.slideText} onChange={(e) => setNewSession((p) => ({ ...p, slideText: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>형광펜 강조 내용 (선택)</Label>
                    <Textarea rows={2} placeholder="교수님이 강조하신 내용..." value={newSession.highlightedText} onChange={(e) => setNewSession((p) => ({ ...p, highlightedText: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>추가 필기 메모 (선택)</Label>
                    <Textarea rows={2} placeholder="여백에 적은 추가 메모..." value={newSession.extraNotes} onChange={(e) => setNewSession((p) => ({ ...p, extraNotes: e.target.value }))} />
                  </div>
                  <Button onClick={createSession} className="w-full" disabled={!newSession.courseId}>세션 생성</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="divide-y">
            {sessions.map((session) => (
              <button
                key={session.id}
                onClick={() => setSelected(session)}
                className={`w-full text-left p-4 hover:bg-accent/50 transition-colors ${selected?.id === session.id ? "bg-primary/5 border-l-2 border-primary" : ""}`}
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <p className="text-sm font-medium truncate">{session.courseName}</p>
                  <StatusBadge status={session.status} />
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {session.week}주차 · {session.date}
                </p>
                {session.status === "done" && analyses[session.id] && (
                  <div className="mt-2">
                    <ScoreMeter score={analyses[session.id].comprehensionScore} />
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Right: analysis detail */}
        <div className="flex-1 overflow-y-auto p-6">
          {selected ? (
            <div>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold">{selected.courseName}</h2>
                  <p className="text-muted-foreground text-sm mt-0.5">
                    {selected.week}주차 · {selected.date}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={selected.status} />
                  {(selected.status === "pending" || selected.status === "error") && (
                    <Button
                      size="sm"
                      className="gap-1.5"
                      onClick={() => runAnalysis(selected)}
                      disabled={analyzing === selected.id}
                    >
                      {analyzing === selected.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5" />
                      )}
                      AI 분석 시작
                    </Button>
                  )}
                  {selected.driveSummaryUrl && (
                    <a href={selected.driveSummaryUrl} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="outline" className="gap-1.5">
                        <ExternalLink className="h-3.5 w-3.5" /> Drive
                      </Button>
                    </a>
                  )}
                </div>
              </div>

              {/* Input data summary */}
              {(selected.slideText || selected.highlightedText || selected.extraNotes) && (
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {[
                    { label: "슬라이드", icon: BookOpen, value: selected.slideText, color: "text-blue-600" },
                    { label: "강조 내용", icon: Highlighter, value: selected.highlightedText, color: "text-amber-600" },
                    { label: "필기 메모", icon: PenLine, value: selected.extraNotes, color: "text-violet-600" },
                  ].map(({ label, icon: Icon, value, color }) => (
                    <Card key={label} className="border-0 shadow-sm">
                      <CardContent className="p-3">
                        <p className={`text-xs font-medium flex items-center gap-1 mb-1 ${color}`}>
                          <Icon className="h-3 w-3" /> {label}
                        </p>
                        <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">
                          {value || "없음"}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* Analysis result */}
              {selected.status === "done" && selectedAnalysis ? (
                <AnalysisView analysis={selectedAnalysis} />
              ) : selected.status === "processing" ? (
                <Card className="border-0 shadow-sm">
                  <CardContent className="py-16 flex flex-col items-center gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-muted-foreground text-sm">AI가 수업 내용을 분석하고 있어요...</p>
                    <p className="text-xs text-muted-foreground">진도 정리 · 개념 보충 · 이해도 · 강조점 · 필기 정리</p>
                  </CardContent>
                </Card>
              ) : (
                <Card className="border-0 shadow-sm">
                  <CardContent className="py-16 flex flex-col items-center gap-3">
                    <Sparkles className="h-8 w-8 text-primary/30" />
                    <p className="text-muted-foreground text-sm">AI 분석 시작 버튼을 눌러 정리본을 생성하세요</p>
                    <Button onClick={() => runAnalysis(selected)} className="gap-2 mt-2">
                      <Sparkles className="h-4 w-4" /> AI 분석 시작
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : (
            <div className="h-full flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <ChevronRight className="h-8 w-8 mx-auto mb-3 opacity-20" />
                <p className="text-sm">왼쪽에서 세션을 선택하거나 새 세션을 만드세요</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Date.prototype.getWeek polyfill (type augmentation)
declare global {
  interface Date {
    getWeek?: () => number;
  }
}
