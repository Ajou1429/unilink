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
  ChevronLeft,
  Cloud,
  Clock,
  FileText,
  Folder,
  FolderOpen,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Unlink,
  Upload,
} from "lucide-react";
import { getStoredCourses } from "@/lib/course-storage";
import {
  addNote,
  getMyNotes,
  MyNote,
  NoteSource,
  updateNoteClassification,
  upsertGoodNotesDriveFiles,
} from "@/lib/my-notes-storage";
import {
  getPersonalStudies,
  PersonalStudy,
} from "@/lib/personal-study-storage";
import { Course } from "@/lib/types";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import {
  DriveFolder,
  DriveConnectionStatus,
  disconnectDrive,
  enableRealtimeWatch,
  getDriveConnectionStatus,
  listDriveFolders,
  rememberDriveConnectionSucceeded,
  startDriveConnection,
  syncDriveFolder,
} from "@/lib/drive-connection";

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

  const [driveStatus, setDriveStatus] = useState<DriveConnectionStatus | null>(null);
  const [driveFolderInput, setDriveFolderInput] = useState("");
  const [driveBusy, setDriveBusy] = useState(false);
  const [driveMessage, setDriveMessage] = useState<string | null>(null);
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  const [folderPickerBusy, setFolderPickerBusy] = useState(false);
  const [folderPickerError, setFolderPickerError] = useState<string | null>(null);
  const [driveFolders, setDriveFolders] = useState<DriveFolder[]>([]);
  const [folderPath, setFolderPath] = useState<{ id: string | null; name: string }[]>([
    { id: null, name: "내 드라이브" },
  ]);

  async function loadNotes() {
    setNotes(await getMyNotes());
  }

  async function loadDriveStatus() {
    if (!isSupabaseConfigured) return;
    const status = await getDriveConnectionStatus();
    setDriveStatus(status);
    if (status.folderId) setDriveFolderInput(status.folderId);
  }

  useEffect(() => {
    loadNotes();
    setCourses(getStoredCourses());
    setPersonalStudies(getPersonalStudies());
    loadDriveStatus();

    if (typeof window !== "undefined" && isSupabaseConfigured) {
      const params = new URLSearchParams(window.location.search);
      const driveParam = params.get("drive");
      if (driveParam === "connected") {
        setDriveMessage("Google Drive 연결에 성공했습니다.");
        rememberDriveConnectionSucceeded().then((status) => {
          setDriveStatus(status);
          if (status.folderId) setDriveFolderInput(status.folderId);
        });
      } else if (driveParam === "error") {
        setDriveMessage(
          `Google Drive 연결에 실패했습니다. (${params.get("reason") ?? "알 수 없는 오류"})`,
        );
      }
      if (driveParam) {
        params.delete("drive");
        params.delete("reason");
        const query = params.toString();
        window.history.replaceState(
          {},
          "",
          window.location.pathname + (query ? `?${query}` : ""),
        );
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const connectedDriveAccount =
    driveStatus?.accountEmail || driveStatus?.accountName || null;
  const currentPickerFolder = folderPath[folderPath.length - 1];

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

  async function handleAddNote() {
    if (!newNote.title.trim()) return;

    const course = courses.find((item) => item.id === newNote.linkedId);
    const personalStudy = personalStudies.find((item) => item.id === newNote.linkedId);
    const linkedTitle =
      newNote.linkedType === "course"
        ? course?.name
        : newNote.linkedType === "personal"
          ? personalStudy?.title
          : undefined;

    await addNote({
      title: newNote.title.trim(),
      courseName: newNote.courseName,
      linkedType: newNote.linkedType,
      linkedId: newNote.linkedId || undefined,
      linkedTitle,
      source: newNote.source,
      content: newNote.content.trim(),
      fileName: newNote.fileName || undefined,
      fileSize: newNote.fileSize || undefined,
      tags: newNote.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    });

    await loadNotes();
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

  async function refreshSync() {
    const now = new Date().toISOString();

    if (isSupabaseConfigured) {
      setDriveBusy(true);
      setDriveMessage(null);
      try {
        const result = await syncDriveFolder(driveFolderInput || undefined);
        setLastSyncAt(result.syncedAt);
        setDriveMessage(
          `동기화 완료: PDF ${result.filesFound}개 중 ${result.upserted}개 반영`,
        );
        await loadNotes();
        await loadDriveStatus();
      } catch (error) {
        setDriveMessage(error instanceof Error ? error.message : "동기화 실패");
      } finally {
        setDriveBusy(false);
      }
      return;
    }

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
          "Google Drive에서 새로 발견된 GoodNotes PDF입니다. 아직 수업이나 개인 학습에 분류되지 않았습니다.",
      },
    ]);
    setLastSyncAt(now);
    if (syncedNotes) setNotes(syncedNotes);
  }

  async function loadDriveFolders(parentId?: string | null) {
    setFolderPickerBusy(true);
    setFolderPickerError(null);
    try {
      setDriveFolders(await listDriveFolders(parentId));
    } catch (error) {
      setFolderPickerError(
        error instanceof Error ? error.message : "Drive 폴더를 불러오지 못했습니다.",
      );
    } finally {
      setFolderPickerBusy(false);
    }
  }

  function openFolderPicker() {
    setFolderPickerOpen(true);
    setFolderPath([{ id: null, name: "내 드라이브" }]);
    loadDriveFolders(null);
  }

  function enterDriveFolder(folder: DriveFolder) {
    setFolderPath((prev) => [...prev, { id: folder.id, name: folder.name }]);
    loadDriveFolders(folder.id);
  }

  function goBackDriveFolder() {
    if (folderPath.length <= 1) return;
    const nextPath = folderPath.slice(0, -1);
    setFolderPath(nextPath);
    loadDriveFolders(nextPath[nextPath.length - 1]?.id ?? null);
  }

  async function selectDriveFolder(folder: DriveFolder) {
    setDriveBusy(true);
    setDriveMessage(null);
    try {
      setDriveFolderInput(folder.id);
      const result = await syncDriveFolder(folder.id);
      setLastSyncAt(result.syncedAt);
      setFolderPickerOpen(false);
      setDriveMessage(
        `${folder.name} 폴더를 지정했습니다. PDF ${result.filesFound}개 중 ${result.upserted}개를 반영했습니다.`,
      );
      await loadNotes();
      await loadDriveStatus();
    } catch (error) {
      setDriveMessage(error instanceof Error ? error.message : "폴더 지정에 실패했습니다.");
    } finally {
      setDriveBusy(false);
    }
  }

  async function handleConnectDrive() {
    setDriveBusy(true);
    setDriveMessage(null);
    try {
      await startDriveConnection();
    } catch (error) {
      setDriveMessage(error instanceof Error ? error.message : "연결 시작에 실패했습니다.");
      setDriveBusy(false);
    }
  }

  async function handleDisconnectDrive() {
    setDriveBusy(true);
    setDriveMessage(null);
    try {
      await disconnectDrive();
      await loadDriveStatus();
      setDriveStatus(null);
      setDriveFolderInput("");
      setDriveMessage("Google Drive 연결을 해제했습니다.");
    } catch (error) {
      setDriveMessage(error instanceof Error ? error.message : "연결 해제에 실패했습니다.");
    } finally {
      setDriveBusy(false);
    }
  }

  async function handleEnableRealtime() {
    setDriveBusy(true);
    setDriveMessage(null);
    try {
      await enableRealtimeWatch();
      await loadDriveStatus();
      setDriveMessage("실시간 동기화를 켰습니다. 이제 Drive 변경이 자동으로 반영됩니다.");
    } catch (error) {
      setDriveMessage(error instanceof Error ? error.message : "실시간 동기화 활성화 실패");
    } finally {
      setDriveBusy(false);
    }
  }

  async function updateNoteAssignment(noteId: string, linkedType: MyNote["linkedType"], linkedId: string) {
    const course = courses.find((item) => item.id === linkedId);
    const personalStudy = personalStudies.find((item) => item.id === linkedId);
    const linkedTitle =
      linkedType === "course"
        ? course?.name
        : linkedType === "personal"
          ? personalStudy?.title
          : undefined;

    const nextNotes = await updateNoteClassification(
      noteId,
      linkedType,
      linkedId || undefined,
      linkedTitle,
    );
    setNotes(nextNotes);
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
                              <SelectItem value="personal">개인 학습</SelectItem>
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
                              : "연결할 개인 학습"}
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
                      <Button onClick={handleAddNote} className="w-full">
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
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={refreshSync}
                  disabled={driveBusy}
                >
                  {driveBusy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  Drive 변경 반영
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                GoodNotes 자동 백업 PDF가 Google Drive에서 변경되면 같은 파일은 덮어쓰고,
                새 파일은 이름 그대로 추가되는 구조입니다.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {!isSupabaseConfigured ? (
                <>
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
                  <p className="text-xs text-muted-foreground">
                    (개발 모드: Supabase가 설정되지 않아 실제 연동 대신 로컬 목업으로
                    동작합니다. .env.local.example 참고)
                  </p>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">Google Drive</p>
                      <p className="text-xs text-muted-foreground">
                        {driveStatus?.connected
                          ? "계정이 연결되어 있습니다"
                          : "아직 연결되지 않았습니다"}
                      </p>
                      {driveStatus?.connected && (
                        <div className="mt-2 flex min-w-0 items-center gap-2">
                          {driveStatus.accountPhotoUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={driveStatus.accountPhotoUrl}
                              alt=""
                              className="h-5 w-5 rounded-full"
                            />
                          )}
                          <p className="truncate text-xs font-medium text-foreground">
                            {connectedDriveAccount ?? "계정 정보 확인 필요"}
                          </p>
                        </div>
                      )}
                    </div>
                    {driveStatus?.connected ? (
                      <Badge variant="secondary" className="gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        연결됨
                      </Badge>
                    ) : (
                      <Badge variant="outline">연결 안 됨</Badge>
                    )}
                  </div>

                  {driveStatus?.connected ? (
                    <div className="space-y-2">
                      <Label className="text-xs">GoodNotes 백업 폴더</Label>
                      <div className="rounded-lg border bg-muted/30 p-3">
                        <p className="text-xs text-muted-foreground">
                          {driveFolderInput
                            ? `선택된 폴더 ID: ${driveFolderInput}`
                            : "아직 선택된 백업 폴더가 없습니다."}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          onClick={openFolderPicker}
                          disabled={driveBusy}
                        >
                          <FolderOpen className="h-3.5 w-3.5" />
                          Drive에서 폴더 선택
                        </Button>
                        {driveFolderInput && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5"
                            onClick={refreshSync}
                            disabled={driveBusy}
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                            선택 폴더 동기화
                          </Button>
                        )}
                      </div>
                      <Dialog open={folderPickerOpen} onOpenChange={setFolderPickerOpen}>
                        <DialogContent className="max-h-[82vh] max-w-xl overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle>Drive 폴더 선택</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4 pt-1">
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold">
                                  {currentPickerFolder.name}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  GoodNotes 자동 백업 PDF가 들어있는 폴더를 선택하세요.
                                </p>
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1.5"
                                onClick={goBackDriveFolder}
                                disabled={folderPath.length <= 1 || folderPickerBusy}
                              >
                                <ChevronLeft className="h-3.5 w-3.5" />
                                뒤로
                              </Button>
                            </div>

                            {currentPickerFolder.id && (
                              <Button
                                size="sm"
                                className="w-full gap-1.5"
                                onClick={() =>
                                  selectDriveFolder({
                                    id: currentPickerFolder.id!,
                                    name: currentPickerFolder.name,
                                    mimeType: "application/vnd.google-apps.folder",
                                  })
                                }
                                disabled={driveBusy}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                현재 폴더 선택하고 동기화
                              </Button>
                            )}

                            {folderPickerError && (
                              <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
                                {folderPickerError}
                              </div>
                            )}

                            {folderPickerBusy ? (
                              <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed py-8 text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Drive 폴더를 불러오는 중
                              </div>
                            ) : driveFolders.length > 0 ? (
                              <div className="space-y-2">
                                {driveFolders.map((folder) => (
                                  <div
                                    key={folder.id}
                                    className="flex items-center justify-between gap-3 rounded-lg border p-3"
                                  >
                                    <button
                                      type="button"
                                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                                      onClick={() => enterDriveFolder(folder)}
                                    >
                                      <Folder className="h-4 w-4 shrink-0 text-primary" />
                                      <span className="truncate text-sm font-medium">
                                        {folder.name}
                                      </span>
                                    </button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => selectDriveFolder(folder)}
                                      disabled={driveBusy}
                                    >
                                      선택
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                                이 위치에는 하위 폴더가 없습니다.
                              </div>
                            )}
                          </div>
                        </DialogContent>
                      </Dialog>

                      <div className="flex flex-wrap gap-2 pt-1">
                        {!driveStatus.channelActive && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5"
                            onClick={handleEnableRealtime}
                            disabled={driveBusy || !driveStatus.folderId}
                          >
                            <Link2 className="h-3.5 w-3.5" />
                            실시간 동기화 켜기
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 text-destructive"
                          onClick={handleDisconnectDrive}
                          disabled={driveBusy}
                        >
                          <Unlink className="h-3.5 w-3.5" />
                          연결 해제
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      className="w-full gap-2"
                      onClick={handleConnectDrive}
                      disabled={driveBusy}
                    >
                      <Link2 className="h-4 w-4" />
                      Google Drive 연결하기
                    </Button>
                  )}

                  {driveMessage && (
                    <p className="text-xs text-muted-foreground">{driveMessage}</p>
                  )}
                </>
              )}
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
                              <SelectItem value="personal">개인 학습</SelectItem>
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
