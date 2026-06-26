"use client";

import { ChangeEvent, Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Award,
  CalendarCheck,
  FileText,
  Paperclip,
  Plus,
  Target,
  Upload,
} from "lucide-react";
import {
  getPersonalStudies,
  getPersonalStudyFiles,
  getPersonalStudyNotes,
  getPersonalStudyPlans,
  PersonalStudy,
  PersonalStudyFile,
  PersonalStudyNote,
  PersonalStudyPlan,
  savePersonalStudyFile,
  savePersonalStudyNote,
  savePersonalStudyPlan,
} from "@/lib/personal-study-storage";
import { getMyNotes, MY_NOTES_CHANGED_EVENT, MyNote } from "@/lib/my-notes-storage";

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function EmptyPersonalStudyState() {
  return (
    <div className="flex flex-col min-h-screen">
      <Header title="개인 과제" />
      <div className="flex-1 p-6 max-w-3xl mx-auto w-full">
        <Card className="border-0 shadow-sm">
          <CardContent className="py-12 text-center">
            <Target className="h-10 w-10 mx-auto mb-4 text-muted-foreground opacity-40" />
            <h2 className="text-lg font-semibold mb-2">개인 과제를 찾을 수 없어요</h2>
            <p className="text-sm text-muted-foreground mb-6">
              시간표 오른쪽 아래 개인 과제 카드에서 새 항목을 추가하세요.
            </p>
            <Link href="/timetable">
              <Button>시간표로 이동</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function PersonalStudyContent() {
  const searchParams = useSearchParams();
  const studyId = searchParams.get("studyId") ?? "";
  const [studies, setStudies] = useState<PersonalStudy[]>([]);
  const [notes, setNotes] = useState<PersonalStudyNote[]>([]);
  const [plans, setPlans] = useState<PersonalStudyPlan[]>([]);
  const [files, setFiles] = useState<PersonalStudyFile[]>([]);
  const [linkedMyNotes, setLinkedMyNotes] = useState<MyNote[]>([]);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [planTitle, setPlanTitle] = useState("");
  const [planDescription, setPlanDescription] = useState("");
  const [planDueDate, setPlanDueDate] = useState("");

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setStudies(getPersonalStudies());
      setNotes(studyId ? getPersonalStudyNotes(studyId) : []);
      setPlans(studyId ? getPersonalStudyPlans(studyId) : []);
      setFiles(studyId ? getPersonalStudyFiles(studyId) : []);
      setLinkedMyNotes(
        studyId
          ? getMyNotes().filter(
              (note) => note.linkedType === "personal" && note.linkedId === studyId,
            )
          : [],
      );
      setNoteTitle("");
      setNoteContent("");
      setPlanTitle("");
      setPlanDescription("");
      setPlanDueDate("");
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [studyId]);

  useEffect(() => {
    function syncLinkedNotes() {
      setLinkedMyNotes(
        studyId
          ? getMyNotes().filter(
              (note) => note.linkedType === "personal" && note.linkedId === studyId,
            )
          : [],
      );
    }

    window.addEventListener(MY_NOTES_CHANGED_EVENT, syncLinkedNotes);
    window.addEventListener("storage", syncLinkedNotes);

    return () => {
      window.removeEventListener(MY_NOTES_CHANGED_EVENT, syncLinkedNotes);
      window.removeEventListener("storage", syncLinkedNotes);
    };
  }, [studyId]);

  const study = studies.find((item) => item.id === studyId) ?? null;

  function addNote() {
    if (!study || !noteTitle.trim()) return;

    const note: PersonalStudyNote = {
      id: Date.now().toString(),
      studyId: study.id,
      title: noteTitle.trim(),
      content: noteContent.trim(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    savePersonalStudyNote(note);
    setNotes((prev) => [note, ...prev]);
    setNoteTitle("");
    setNoteContent("");
  }

  function addPlan() {
    if (!study || !planTitle.trim()) return;

    const plan: PersonalStudyPlan = {
      id: Date.now().toString(),
      studyId: study.id,
      title: planTitle.trim(),
      description: planDescription.trim(),
      dueDate: planDueDate,
      isCompleted: false,
      createdAt: new Date().toISOString(),
    };

    savePersonalStudyPlan(plan);
    setPlans((prev) => [plan, ...prev]);
    setPlanTitle("");
    setPlanDescription("");
    setPlanDueDate("");
  }

  function uploadFiles(event: ChangeEvent<HTMLInputElement>) {
    if (!study || !event.target.files) return;

    const uploaded = Array.from(event.target.files).map((file) => ({
      id: `${Date.now()}-${file.name}`,
      studyId: study.id,
      name: file.name,
      type: file.type || "파일",
      size: file.size,
      createdAt: new Date().toISOString(),
    }));

    uploaded.forEach(savePersonalStudyFile);
    setFiles((prev) => [...uploaded, ...prev]);
    event.target.value = "";
  }

  if (!studyId || !study) {
    return <EmptyPersonalStudyState />;
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header title={study.title} />
      <div className="flex-1 p-6 max-w-6xl mx-auto w-full space-y-6">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div
                    className="h-4 w-4 rounded-full"
                    style={{ backgroundColor: study.color }}
                  />
                  <h2 className="text-2xl font-bold">{study.title}</h2>
                  <Badge variant="secondary">{study.category}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {study.goal || "목표를 추가하면 여기에서 확인할 수 있습니다."}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <div className="text-xl font-bold text-primary">{notes.length}</div>
                  <div className="text-xs text-muted-foreground">노트</div>
                </div>
                <div>
                  <div className="text-xl font-bold text-primary">{plans.length}</div>
                  <div className="text-xs text-muted-foreground">계획</div>
                </div>
                <div>
                  <div className="text-xl font-bold text-primary">{files.length}</div>
                  <div className="text-xs text-muted-foreground">파일</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs key={study.id} defaultValue="notes">
          <TabsList className="bg-white border shadow-sm mb-6">
            <TabsTrigger value="notes" className="gap-2">
              <FileText className="h-4 w-4" /> 노트 정리
            </TabsTrigger>
            <TabsTrigger value="plans" className="gap-2">
              <CalendarCheck className="h-4 w-4" /> 학습 계획
            </TabsTrigger>
            <TabsTrigger value="files" className="gap-2">
              <Paperclip className="h-4 w-4" /> 자료
            </TabsTrigger>
          </TabsList>

          <TabsContent value="notes">
            <div className="grid lg:grid-cols-3 gap-6">
              <Card className="border-0 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Plus className="h-4 w-4" /> 노트 추가
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <Label>제목</Label>
                    <Input
                      placeholder="예: 1과목 핵심 요약"
                      value={noteTitle}
                      onChange={(event) => setNoteTitle(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>내용</Label>
                    <Textarea
                      rows={8}
                      placeholder="개인 과제 내용을 정리하세요"
                      value={noteContent}
                      onChange={(event) => setNoteContent(event.target.value)}
                    />
                  </div>
                  <Button onClick={addNote} className="w-full">
                    노트 저장
                  </Button>
                </CardContent>
              </Card>

              <div className="lg:col-span-2 space-y-3">
                {linkedMyNotes.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground">
                      GoodNotes 연동 노트
                    </p>
                    {linkedMyNotes.map((note) => (
                      <Card key={note.id} className="border-0 shadow-sm">
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <Upload className="h-4 w-4 text-primary mt-1 shrink-0" />
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <h3 className="font-semibold">{note.title}</h3>
                                <Badge variant="secondary">v{note.version}</Badge>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">
                                {note.fileName ?? "GoodNotes PDF"} ·{" "}
                                {new Date(note.updatedAt).toLocaleString("ko-KR")}
                              </p>
                              <p className="text-sm text-muted-foreground mt-3 whitespace-pre-wrap">
                                {note.content || "내용이 비어 있습니다."}
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {notes.length > 0 ? (
                  notes.map((note) => (
                    <Card key={note.id} className="border-0 shadow-sm">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <FileText className="h-4 w-4 text-primary mt-1 shrink-0" />
                          <div className="min-w-0">
                            <h3 className="font-semibold">{note.title}</h3>
                            <p className="text-xs text-muted-foreground mt-1">
                              {new Date(note.createdAt).toLocaleDateString("ko-KR")}
                            </p>
                            <p className="text-sm text-muted-foreground mt-3 whitespace-pre-wrap">
                              {note.content || "내용이 비어 있습니다."}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                ) : linkedMyNotes.length === 0 ? (
                  <Card className="border-0 shadow-sm">
                    <CardContent className="py-12 text-center text-muted-foreground">
                      <FileText className="h-8 w-8 mx-auto mb-3 opacity-30" />
                      <p className="text-sm">아직 정리한 노트가 없어요.</p>
                    </CardContent>
                  </Card>
                ) : null}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="plans">
            <div className="grid lg:grid-cols-3 gap-6">
              <Card className="border-0 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Plus className="h-4 w-4" /> 계획 추가
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <Label>계획 제목</Label>
                    <Input
                      placeholder="예: 필기 1회독 끝내기"
                      value={planTitle}
                      onChange={(event) => setPlanTitle(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>마감일</Label>
                    <Input
                      type="date"
                      value={planDueDate}
                      onChange={(event) => setPlanDueDate(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>설명</Label>
                    <Textarea
                      rows={5}
                      placeholder="해야 할 공부 내용을 적어주세요"
                      value={planDescription}
                      onChange={(event) => setPlanDescription(event.target.value)}
                    />
                  </div>
                  <Button onClick={addPlan} className="w-full">
                    계획 저장
                  </Button>
                </CardContent>
              </Card>

              <div className="lg:col-span-2 space-y-3">
                {plans.length > 0 ? (
                  plans.map((plan) => (
                    <Card key={plan.id} className="border-0 shadow-sm">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <CalendarCheck className="h-4 w-4 text-primary mt-1 shrink-0" />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold">{plan.title}</h3>
                              {plan.dueDate && (
                                <Badge variant="outline">마감 {plan.dueDate}</Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground mt-2">
                              {plan.description || "설명이 비어 있습니다."}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                ) : (
                  <Card className="border-0 shadow-sm">
                    <CardContent className="py-12 text-center text-muted-foreground">
                      <CalendarCheck className="h-8 w-8 mx-auto mb-3 opacity-30" />
                      <p className="text-sm">아직 등록한 학습 계획이 없어요.</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="files">
            <div className="grid lg:grid-cols-3 gap-6">
              <Card className="border-0 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Upload className="h-4 w-4" /> 자료 올리기
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Label htmlFor="personal-study-files">PDF, 이미지, 정리 파일</Label>
                  <Input id="personal-study-files" type="file" multiple onChange={uploadFiles} />
                  <p className="text-xs text-muted-foreground">
                    현재 단계에서는 파일명과 용량 정보만 브라우저에 저장합니다.
                  </p>
                </CardContent>
              </Card>

              <div className="lg:col-span-2 space-y-3">
                {files.length > 0 ? (
                  files.map((file) => (
                    <Card key={file.id} className="border-0 shadow-sm">
                      <CardContent className="p-4 flex items-center gap-3">
                        <Paperclip className="h-4 w-4 text-primary shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{file.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {file.type} · {formatBytes(file.size)} ·{" "}
                            {new Date(file.createdAt).toLocaleDateString("ko-KR")}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                ) : (
                  <Card className="border-0 shadow-sm">
                    <CardContent className="py-12 text-center text-muted-foreground">
                      <Award className="h-8 w-8 mx-auto mb-3 opacity-30" />
                      <p className="text-sm">아직 올린 자료가 없어요.</p>
                    </CardContent>
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

export default function PersonalStudyPage() {
  return (
    <Suspense fallback={<EmptyPersonalStudyState />}>
      <PersonalStudyContent />
    </Suspense>
  );
}
