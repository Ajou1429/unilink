"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { Header } from "@/components/layout/Header";
import { NoteViewerDialog } from "@/components/notes/NoteViewerDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  CheckCircle2,
  Cloud,
  Clock,
  FileText,
  Plus,
  RefreshCw,
  Search,
  Upload,
} from "lucide-react";
import { getStoredCourses } from "@/lib/course-storage";
import {
  getMyNotes,
  MyNote,
  NoteSource,
  saveMyNotes,
  upsertGoodNotesDriveFiles,
} from "@/lib/my-notes-storage";
import {
  getPersonalStudies,
  PersonalStudy,
} from "@/lib/personal-study-storage";
import { Course } from "@/lib/types";

const NOTE_SOURCES: NoteSource[] = [
  "GoodNotes",
  "Notability",
  "Apple Notes",
  "Google Drive",
  "직접 작성",
];

function formatBytes(size?: number) {
  if (!size) return "";
  if (size < 1024 * 1024) return `${Math.round(size / 1024)}KB`;
  return `${(size / 1024 / 1024).toFixed(1)}MB`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function NotesPage() {
  const [notes, setNotes] = useState<MyNote[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [personalStudies, setPersonalStudies] = useState<PersonalStudy[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState(new Date().toISOString());
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [newNote, setNewNote] = useState({
    title: "",
    courseName: "",
    linkedType: "unassigned" as "course" | "personal" | "unassigned",
    linkedId: "",
    source: "GoodNotes" as NoteSource,
    content: "",
    tags: "",
    fileName: "",
    fileSize: 0,
  });

  useEffect(() => {
    window.setTimeout(() => {
      setNotes(getMyNotes());
      setCourses(getStoredCourses());
      setPersonalStudies(getPersonalStudies());
    }, 0);
  }, []);

  useEffect(() => {
    if (!feedbackMessage) return;

    const timeout = window.setTimeout(() => setFeedbackMessage(""), 2200);
    return () => window.clearTimeout(timeout);
  }, [feedbackMessage]);

  const filteredNotes = useMemo(() => {
    const keyword = search.trim();
    if (!keyword) return notes;

    return notes.filter((note) => {
      return (
        note.title.includes(keyword) ||
        note.courseName.includes(keyword) ||
        note.content.includes(keyword) ||
        note.tags.some((tag) => tag.includes(keyword))
      );
    });
  }, [notes, search]);

  const syncedCount = notes.filter((note) => note.syncStatus === "synced").length;
  const assignedCount = notes.filter((note) => note.linkedType !== "unassigned").length;

  function persistNotes(nextNotes: MyNote[]) {
    setNotes(nextNotes);
    saveMyNotes(nextNotes);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setNewNote((prev) => ({
      ...prev,
      fileName: file.name,
      fileSize: file.size,
      title: prev.title || file.name.replace(/\.[^.]+$/, ""),
    }));
  }

  function addNote() {
    if (!newNote.title.trim()) return;

    const now = new Date().toISOString();
    const course = courses.find((item) => item.id === newNote.linkedId);
    const personalStudy = personalStudies.find((item) => item.id === newNote.linkedId);
    const linkedTitle =
      newNote.linkedType === "course"
        ? course?.name
        : newNote.linkedType === "personal"
          ? personalStudy?.title
          : undefined;
    const note: MyNote = {
      id: Date.now().toString(),
      title: newNote.title.trim(),
      courseName: (linkedTitle ?? newNote.courseName) || "미분류",
      linkedType: newNote.linkedType,
      linkedId: newNote.linkedId || undefined,
      linkedTitle,
      source: newNote.source,
      syncStatus: newNote.source === "직접 작성" ? "manual" : "synced",
      content: newNote.content.trim(),
      fileName: newNote.fileName || undefined,
      fileSize: newNote.fileSize || undefined,
      driveFileId:
        newNote.source === "GoodNotes" && newNote.fileName
          ? `manual-${newNote.fileName}`
          : undefined,
      driveModifiedTime: newNote.source === "GoodNotes" ? now : undefined,
      version: 1,
      tags: newNote.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      createdAt: now,
      updatedAt: now,
    };

    persistNotes([note, ...notes]);
    setOpen(false);
    setFeedbackMessage("노트가 저장되었습니다.");
    setNewNote({
      title: "",
      courseName: "",
      linkedType: "unassigned",
      linkedId: "",
      source: "GoodNotes",
      content: "",
      tags: "",
      fileName: "",
      fileSize: 0,
    });
  }

  function refreshSync() {
    const now = new Date().toISOString();
    const syncedNotes = upsertGoodNotesDriveFiles([
      {
        driveFileId: "drive-goodnotes-os-week7",
        fileName: "OS_week7_goodnotes.pdf",
        modifiedTime: now,
        size: 2600000,
        contentSummary:
          "GoodNotes에서 수정된 PDF입니다. 교착상태 해결 방법과 은행원 알고리즘 내용이 추가되었습니다.",
      },
      {
        driveFileId: `drive-goodnotes-new-${Date.now()}`,
        fileName: "GoodNotes_새_필기.pdf",
        modifiedTime: now,
        size: 1800000,
        contentSummary:
          "Google Drive에서 새로 발견된 GoodNotes PDF입니다. 아직 수업이나 개인 과제에 분류되지 않았습니다.",
      },
    ]);
    setLastSyncAt(now);
    setNotes(syncedNotes);
  }

  function updateNoteAssignment(noteId: string, linkedType: MyNote["linkedType"], linkedId: string) {
    const course = courses.find((item) => item.id === linkedId);
    const personalStudy = personalStudies.find((item) => item.id === linkedId);
    const linkedTitle =
      linkedType === "course"
        ? course?.name
        : linkedType === "personal"
          ? personalStudy?.title
          : undefined;

    persistNotes(
      notes.map((note) =>
        note.id === noteId
          ? {
              ...note,
              linkedType,
              linkedId: linkedId || undefined,
              linkedTitle,
              courseName: linkedTitle ?? "미분류",
              updatedAt: new Date().toISOString(),
            }
          : note,
      ),
    );
    setFeedbackMessage(
      linkedType === "unassigned"
        ? "강의 노트 분류가 해제되었습니다."
        : "강의 노트가 분류되었습니다.",
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header title="나의 노트" />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-6">
        {feedbackMessage && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 shadow-sm">
            <CheckCircle2 className="h-4 w-4" />
            {feedbackMessage}
          </div>
        )}
        <section className="grid gap-4 lg:grid-cols-[1.3fr_0.9fr]">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <FileText className="h-5 w-5 text-primary" />
                    필기 보관함
                  </CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    수업 필기, PDF, 이미지 파일을 한곳에서 관리합니다.
                  </p>
                </div>
                <Dialog open={open} onOpenChange={setOpen}>
                  <DialogTrigger render={<Button className="gap-2" />}>
                    <Plus className="h-4 w-4" />
                    노트 추가
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>나의 노트 추가</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label>제목</Label>
                          <Input
                            placeholder="예: 알고리즘 그래프 필기"
                            value={newNote.title}
                            onChange={(event) =>
                              setNewNote((prev) => ({
                                ...prev,
                                title: event.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>분류</Label>
                          <Select
                            value={newNote.linkedType}
                            onValueChange={(value) =>
                              setNewNote((prev) => ({
                                ...prev,
                                linkedType: value as typeof newNote.linkedType,
                                linkedId: "",
                              }))
                            }
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="course">내 수업</SelectItem>
                              <SelectItem value="personal">개인 과제</SelectItem>
                              <SelectItem value="unassigned">미분류</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {newNote.linkedType !== "unassigned" && (
                        <div className="space-y-2">
                          <Label>
                            {newNote.linkedType === "course"
                              ? "연결할 수업"
                              : "연결할 개인 과제"}
                          </Label>
                          <Select
                            value={newNote.linkedId}
                            onValueChange={(value) =>
                              setNewNote((prev) => ({
                                ...prev,
                                linkedId: value ?? prev.linkedId,
                              }))
                            }
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="항목 선택" />
                            </SelectTrigger>
                            <SelectContent>
                              {newNote.linkedType === "course"
                                ? courses.map((course) => (
                                    <SelectItem key={course.id} value={course.id}>
                                      {course.name}
                                    </SelectItem>
                                  ))
                                : personalStudies.map((study) => (
                                    <SelectItem key={study.id} value={study.id}>
                                      {study.title}
                                    </SelectItem>
                                  ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label>출처</Label>
                          <Select
                            value={newNote.source}
                            onValueChange={(value) =>
                              setNewNote((prev) => ({
                                ...prev,
                                source: (value as NoteSource) ?? prev.source,
                              }))
                            }
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {NOTE_SOURCES.map((source) => (
                                <SelectItem key={source} value={source}>
                                  {source}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>파일</Label>
                          <Input
                            type="file"
                            accept=".pdf,.png,.jpg,.jpeg,.heic,.webp"
                            onChange={handleFileChange}
                          />
                          {newNote.fileName && (
                            <p className="text-xs text-muted-foreground">
                              {newNote.fileName} · {formatBytes(newNote.fileSize)}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>내용 메모</Label>
                        <Textarea
                          rows={5}
                          placeholder="필기 핵심 내용이나 추후 자동 동기화 메모를 적어주세요."
                          value={newNote.content}
                          onChange={(event) =>
                            setNewNote((prev) => ({
                              ...prev,
                              content: event.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>태그</Label>
                        <Input
                          placeholder="예: 시험범위, 과제, 그래프"
                          value={newNote.tags}
                          onChange={(event) =>
                            setNewNote((prev) => ({ ...prev, tags: event.target.value }))
                          }
                        />
                      </div>
                      <Button onClick={addNote} className="w-full">
                        저장하기
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg bg-muted/50 p-3">
                  <div className="text-2xl font-bold">{notes.length}</div>
                  <p className="text-xs text-muted-foreground">전체 노트</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3">
                  <div className="text-2xl font-bold">{syncedCount}</div>
                  <p className="text-xs text-muted-foreground">클라우드 동기화</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3">
                  <div className="text-2xl font-bold">{assignedCount}</div>
                  <p className="text-xs text-muted-foreground">분류된 노트</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Cloud className="h-5 w-5 text-primary" />
                  필기앱 연동
                </CardTitle>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={refreshSync}>
                  <RefreshCw className="h-3.5 w-3.5" />
                  Drive 변경 반영
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                GoodNotes 자동 백업 PDF가 Google Drive에서 변경되면 같은 파일은 덮어쓰고,
                새 파일은 이름 그대로 추가되는 구조입니다.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {["GoodNotes", "iCloud Drive", "Google Drive"].map((provider) => (
                <div
                  key={provider}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div>
                    <p className="text-sm font-medium">{provider}</p>
                    <p className="text-xs text-muted-foreground">
                      변경 감지 후 UniLink 노트로 자동 반영
                    </p>
                  </div>
                  <Badge variant="secondary" className="gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    준비됨
                  </Badge>
                </div>
              ))}
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                마지막 확인: {formatDate(lastSyncAt)}
              </p>
            </CardContent>
          </Card>
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="노트, 수업, 태그 검색..."
                className="pl-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </div>

          {filteredNotes.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2">
              {filteredNotes.map((note) => (
                <Card key={note.id} className="border-0 shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="rounded-lg bg-primary/10 p-2 text-primary">
                        {note.fileName ? (
                          <Upload className="h-4 w-4" />
                        ) : (
                          <FileText className="h-4 w-4" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="truncate font-semibold">{note.title}</h3>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {note.linkedTitle ?? note.courseName} · {note.source}
                              {note.version > 1 ? ` · v${note.version}` : ""}
                            </p>
                          </div>
                          <Badge
                            variant={note.syncStatus === "synced" ? "secondary" : "outline"}
                            className="shrink-0"
                          >
                            {note.syncStatus === "synced"
                              ? "동기화됨"
                              : note.syncStatus === "pending"
                                ? "대기 중"
                                : "수동"}
                          </Badge>
                        </div>
                        {note.content && (
                          <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                            {note.content}
                          </p>
                        )}
                        {note.fileName && (
                          <p className="mt-2 text-xs text-muted-foreground">
                            {note.fileName} · {formatBytes(note.fileSize)}
                          </p>
                        )}
                        {note.driveModifiedTime && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Drive 수정 시각 {formatDate(note.driveModifiedTime)}
                          </p>
                        )}
                        <div className="mt-3">
                          <NoteViewerDialog note={note} />
                        </div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          <Select
                            value={note.linkedType}
                            onValueChange={(value) =>
                              updateNoteAssignment(
                                note.id,
                                value as MyNote["linkedType"],
                                "",
                              )
                            }
                          >
                            <SelectTrigger className="h-8 w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="course">내 수업</SelectItem>
                              <SelectItem value="personal">개인 과제</SelectItem>
                              <SelectItem value="unassigned">미분류</SelectItem>
                            </SelectContent>
                          </Select>
                          {note.linkedType !== "unassigned" && (
                            <Select
                              value={note.linkedId ?? ""}
                              onValueChange={(value) =>
                                updateNoteAssignment(note.id, note.linkedType, value ?? "")
                              }
                            >
                              <SelectTrigger className="h-8 w-full">
                                <SelectValue placeholder="분류 항목 선택" />
                              </SelectTrigger>
                              <SelectContent>
                                {note.linkedType === "course"
                                  ? courses.map((course) => (
                                      <SelectItem key={course.id} value={course.id}>
                                        {course.name}
                                      </SelectItem>
                                    ))
                                  : personalStudies.map((study) => (
                                      <SelectItem key={study.id} value={study.id}>
                                        {study.title}
                                      </SelectItem>
                                    ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {note.tags.map((tag) => (
                            <Badge
                              key={tag}
                              variant="outline"
                              className="px-1.5 py-0 text-[10px]"
                            >
                              {tag}
                            </Badge>
                          ))}
                        </div>
                        <p className="mt-3 text-[11px] text-muted-foreground">
                          마지막 수정 {formatDate(note.updatedAt)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="border-dashed shadow-sm">
              <CardContent className="py-12 text-center text-muted-foreground">
                <FileText className="mx-auto mb-3 h-9 w-9 opacity-40" />
                <p className="text-sm">아직 등록된 노트가 없어요.</p>
              </CardContent>
            </Card>
          )}
        </section>
      </main>
    </div>
  );
}
