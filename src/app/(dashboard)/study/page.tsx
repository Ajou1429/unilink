"use client";

import { useState } from "react";
import { Header } from "@/components/layout/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CheckCircle2,
  Circle,
  Plus,
  Sparkles,
  BookOpen,
  FileText,
  Calendar,
  Clock,
  Tag,
  Loader2,
} from "lucide-react";
import { mockStudyPlans, mockNotes, mockCourses } from "@/lib/mock-data";
import { StudyPlan, LectureNote } from "@/lib/types";

export default function StudyPage() {
  const [plans, setPlans] = useState<StudyPlan[]>(mockStudyPlans);
  const [notes, setNotes] = useState<LectureNote[]>(mockNotes);
  const [planOpen, setPlanOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState("");
  const [selectedNote, setSelectedNote] = useState<LectureNote | null>(null);

  const [newPlan, setNewPlan] = useState({
    courseId: "",
    title: "",
    description: "",
    dueDate: "",
    week: 8,
  });

  const [newNote, setNewNote] = useState({
    courseId: "",
    title: "",
    content: "",
    week: 8,
    tags: "",
  });

  const completed = plans.filter((p) => p.isCompleted).length;
  const total = plans.length;

  function togglePlan(id: string) {
    setPlans((prev) =>
      prev.map((p) => (p.id === id ? { ...p, isCompleted: !p.isCompleted } : p))
    );
  }

  function addPlan() {
    if (!newPlan.courseId || !newPlan.title) return;
    const course = mockCourses.find((c) => c.id === newPlan.courseId);
    const plan: StudyPlan = {
      id: Date.now().toString(),
      userId: "me",
      courseId: newPlan.courseId,
      courseName: course?.name ?? "",
      week: newPlan.week,
      title: newPlan.title,
      description: newPlan.description,
      dueDate: newPlan.dueDate,
      isCompleted: false,
      createdAt: new Date().toISOString(),
    };
    setPlans((prev) => [...prev, plan]);
    setPlanOpen(false);
    setNewPlan({ courseId: "", title: "", description: "", dueDate: "", week: 8 });
  }

  function addNote() {
    if (!newNote.courseId || !newNote.title) return;
    const course = mockCourses.find((c) => c.id === newNote.courseId);
    const note: LectureNote = {
      id: Date.now().toString(),
      userId: "me",
      courseId: newNote.courseId,
      courseName: course?.name ?? "",
      week: newNote.week,
      title: newNote.title,
      content: newNote.content,
      tags: newNote.tags.split(",").map((t) => t.trim()).filter(Boolean),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setNotes((prev) => [...prev, note]);
    setNoteOpen(false);
    setNewNote({ courseId: "", title: "", content: "", week: 8, tags: "" });
  }

  function generateAIPlan() {
    setAiLoading(true);
    setAiResult("");
    // Simulate AI response
    setTimeout(() => {
      setAiLoading(false);
      setAiResult(`## 이번 주 맞춤 학습 플랜 (8주차)

### 우선순위 1 — 운영체제 (중간고사 D-7)
- [ ] 1~7장 요약 노트 복습 (예상 소요: 2시간)
- [ ] 교착상태, 메모리 관리 파트 집중 복습
- [ ] 기출 문제 5년치 풀기

### 우선순위 2 — 데이터베이스
- [ ] 정규화 개념 정리 및 예제 풀기 (1시간)
- [ ] SQL JOIN 쿼리 작성 연습 10개

### 우선순위 3 — 알고리즘
- [ ] 그리디 알고리즘 직접 구현해보기
- [ ] 백준 문제 3개 풀기 (골드 이하)

### 추천 공부 시간
- 월/수: 운영체제 집중 (저녁 7–9시)
- 화/목: 데이터베이스 + 알고리즘 (저녁 8–10시)
- 금: 전체 복습 및 정리

> 중간고사까지 총 예상 공부 시간: **약 18시간**`);
    }, 2000);
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header title="학습 플랜" />
      <div className="flex-1 p-6 max-w-6xl mx-auto w-full">

        {/* Progress bar */}
        <div className="mb-6 flex items-center gap-4">
          <div className="flex-1 bg-muted rounded-full h-2">
            <div
              className="bg-primary h-2 rounded-full transition-all"
              style={{ width: `${total > 0 ? (completed / total) * 100 : 0}%` }}
            />
          </div>
          <span className="text-sm text-muted-foreground shrink-0">
            {completed}/{total} 완료
          </span>
          <Dialog open={aiOpen} onOpenChange={setAiOpen}>
            <DialogTrigger render={<Button className="gap-2 shrink-0" onClick={generateAIPlan} />}>
              <Sparkles className="h-4 w-4" /> AI 플랜 생성
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" /> AI 맞춤 학습 플랜
                </DialogTitle>
              </DialogHeader>
              <div className="pt-2">
                {aiLoading ? (
                  <div className="flex flex-col items-center py-12 gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-muted-foreground text-sm">
                      수업 데이터를 분석해 맞춤 플랜을 생성하는 중...
                    </p>
                  </div>
                ) : (
                  <div className="prose prose-sm max-w-none">
                    <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans bg-muted/50 rounded-lg p-4">
                      {aiResult}
                    </pre>
                    <Button className="mt-4 w-full">이 플랜으로 할일 추가하기</Button>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <Tabs defaultValue="plans">
          <TabsList className="bg-white border shadow-sm mb-6">
            <TabsTrigger value="plans" className="gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4" /> 학습 계획
            </TabsTrigger>
            <TabsTrigger value="notes" className="gap-2 text-sm">
              <FileText className="h-4 w-4" /> 강의 노트
            </TabsTrigger>
          </TabsList>

          {/* Study Plans Tab */}
          <TabsContent value="plans" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-sm font-medium text-muted-foreground">8주차 · 이번 주</h2>
              <Dialog open={planOpen} onOpenChange={setPlanOpen}>
                <DialogTrigger render={<Button size="sm" variant="outline" className="gap-1.5" />}>
                  <Plus className="h-3.5 w-3.5" /> 계획 추가
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>학습 계획 추가</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 pt-2">
                    <div className="space-y-2">
                      <Label>수업</Label>
                      <Select value={newPlan.courseId} onValueChange={(v) => v != null && setNewPlan((p) => ({ ...p, courseId: v }))}>
                        <SelectTrigger><SelectValue placeholder="수업 선택" /></SelectTrigger>
                        <SelectContent>
                          {mockCourses.map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>제목</Label>
                      <Input placeholder="예) 중간고사 복습" value={newPlan.title} onChange={(e) => setNewPlan((p) => ({ ...p, title: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>내용 (선택)</Label>
                      <Textarea placeholder="세부 내용을 입력하세요" value={newPlan.description} onChange={(e) => setNewPlan((p) => ({ ...p, description: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>마감일</Label>
                      <Input type="date" value={newPlan.dueDate} onChange={(e) => setNewPlan((p) => ({ ...p, dueDate: e.target.value }))} />
                    </div>
                    <Button onClick={addPlan} className="w-full">추가하기</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              {plans.map((plan) => (
                <Card key={plan.id} className={`border-0 shadow-sm transition-opacity ${plan.isCompleted ? "opacity-60" : ""}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <button onClick={() => togglePlan(plan.id)} className="mt-0.5 shrink-0">
                        {plan.isCompleted ? (
                          <CheckCircle2 className="h-5 w-5 text-primary" />
                        ) : (
                          <Circle className="h-5 w-5 text-muted-foreground" />
                        )}
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className={`font-medium text-sm ${plan.isCompleted ? "line-through text-muted-foreground" : ""}`}>
                          {plan.title}
                        </p>
                        {plan.description && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{plan.description}</p>
                        )}
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{plan.courseName}</Badge>
                          {plan.dueDate && (
                            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />{plan.dueDate}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Lecture Notes Tab */}
          <TabsContent value="notes">
            <div className="grid lg:grid-cols-3 gap-6">
              {/* Notes list */}
              <div className="lg:col-span-1 space-y-3">
                <div className="flex justify-between items-center">
                  <h2 className="text-sm font-medium text-muted-foreground">강의 노트</h2>
                  <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
                    <DialogTrigger render={<Button size="sm" variant="outline" className="gap-1.5" />}>
                      <Plus className="h-3.5 w-3.5" /> 노트 추가
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>강의 노트 작성</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 pt-2">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <Label>수업</Label>
                            <Select value={newNote.courseId} onValueChange={(v) => v != null && setNewNote((p) => ({ ...p, courseId: v }))}>
                              <SelectTrigger><SelectValue placeholder="수업 선택" /></SelectTrigger>
                              <SelectContent>
                                {mockCourses.map((c) => (
                                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>주차</Label>
                            <Input type="number" min={1} max={16} value={newNote.week} onChange={(e) => setNewNote((p) => ({ ...p, week: Number(e.target.value) }))} />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>제목</Label>
                          <Input placeholder="예) 7주차 - 교착상태" value={newNote.title} onChange={(e) => setNewNote((p) => ({ ...p, title: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                          <Label>내용 (마크다운 지원)</Label>
                          <Textarea placeholder="강의 내용을 정리하세요..." rows={8} value={newNote.content} onChange={(e) => setNewNote((p) => ({ ...p, content: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                          <Label>태그 (쉼표로 구분)</Label>
                          <Input placeholder="예) 교착상태, OS, 운영체제" value={newNote.tags} onChange={(e) => setNewNote((p) => ({ ...p, tags: e.target.value }))} />
                        </div>
                        <Button onClick={addNote} className="w-full">저장하기</Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>

                {notes.map((note) => (
                  <Card
                    key={note.id}
                    onClick={() => setSelectedNote(note)}
                    className={`border-0 shadow-sm cursor-pointer transition-all hover:shadow-md ${selectedNote?.id === note.id ? "ring-2 ring-primary" : ""}`}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-start gap-2">
                        <BookOpen className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{note.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {note.courseName} · {note.week}주차
                          </p>
                          <div className="flex flex-wrap gap-1 mt-2">
                            {note.tags.map((tag) => (
                              <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0">{tag}</Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Note viewer */}
              <div className="lg:col-span-2">
                {selectedNote ? (
                  <Card className="border-0 shadow-sm h-full">
                    <CardHeader className="pb-3 border-b">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <CardTitle className="text-base">{selectedNote.title}</CardTitle>
                          <p className="text-sm text-muted-foreground mt-1">
                            {selectedNote.courseName} · {selectedNote.week}주차
                          </p>
                        </div>
                        <Button size="sm" variant="outline" className="gap-1.5 shrink-0">
                          <Sparkles className="h-3.5 w-3.5 text-primary" /> AI 요약
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {selectedNote.tags.map((tag) => (
                          <Badge key={tag} variant="secondary" className="text-xs gap-1">
                            <Tag className="h-2.5 w-2.5" />{tag}
                          </Badge>
                        ))}
                      </div>
                    </CardHeader>
                    <CardContent className="p-4">
                      <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans">
                        {selectedNote.content}
                      </pre>
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="border-0 shadow-sm h-64 flex items-center justify-center">
                    <div className="text-center text-muted-foreground">
                      <FileText className="h-8 w-8 mx-auto mb-3 opacity-30" />
                      <p className="text-sm">노트를 선택하면 여기서 볼 수 있어요</p>
                    </div>
                  </Card>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
