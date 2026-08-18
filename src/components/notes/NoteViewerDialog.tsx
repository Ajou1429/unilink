"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { MyNote } from "@/lib/my-notes-storage";
import { getSupabaseClient } from "@/lib/supabase/client";
import { CalendarClock, ExternalLink, FileText, HardDrive } from "lucide-react";

interface NoteViewerDialogProps {
  note: MyNote;
  triggerLabel?: string;
}

function formatBytes(size?: number) {
  if (!size) return "";
  if (size < 1024 * 1024) return `${Math.round(size / 1024)}KB`;
  return `${(size / 1024 / 1024).toFixed(1)}MB`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getNoteFileName(note: MyNote) {
  return note.fileName ?? `${note.title}.txt`;
}

export function NoteViewerDialog({
  note,
  triggerLabel = "노트 열기",
}: NoteViewerDialogProps) {
  const [fileUrl, setFileUrl] = useState<string | null>(note.fileDataUrl ?? null);
  const [fileError, setFileError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setFileUrl(note.fileDataUrl ?? null);
    setFileError(null);

    if (!note.filePath || note.fileDataUrl) return;

    const supabase = getSupabaseClient();
    if (!supabase) return;

    supabase.storage
      .from("note-files")
      .createSignedUrl(note.filePath, 60 * 60)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data?.signedUrl) {
          setFileError("파일을 불러오지 못했습니다.");
          return;
        }
        setFileUrl(data.signedUrl);
      });

    return () => {
      cancelled = true;
    };
  }, [note.fileDataUrl, note.filePath]);

  const fileExtension = note.fileName?.split(".").pop()?.toLowerCase();
  const isImage = Boolean(
    fileExtension && ["png", "jpg", "jpeg", "webp", "gif"].includes(fileExtension),
  );
  const isPdf = fileExtension === "pdf";

  return (
    <Dialog>
      <DialogTrigger render={<Button size="sm" variant="outline" className="gap-1.5" />}>
        <ExternalLink className="h-3.5 w-3.5" />
        {triggerLabel}
      </DialogTrigger>
      <DialogContent className="max-h-[86vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="pr-8">{note.title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  <p className="truncate font-semibold">{getNoteFileName(note)}</p>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <HardDrive className="h-3.5 w-3.5" />
                    {note.source}
                    {note.fileSize ? ` · ${formatBytes(note.fileSize)}` : ""}
                  </span>
                  <span className="flex items-center gap-1">
                    <CalendarClock className="h-3.5 w-3.5" />
                    {formatDate(note.updatedAt)}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-1.5">
                <Badge variant="secondary">{note.linkedTitle ?? note.courseName}</Badge>
                {note.version > 1 && <Badge variant="outline">v{note.version}</Badge>}
              </div>
            </div>
          </div>

          <div className="min-h-80 rounded-lg border bg-white p-5 shadow-inner">
            <div className="mb-4 flex items-center justify-between border-b pb-3">
              <div>
                <p className="text-sm font-semibold">노트 내용</p>
                <p className="text-xs text-muted-foreground">
                  {note.fileName ? "연동된 파일 요약" : "직접 작성한 노트"}
                </p>
              </div>
              <Badge variant={note.syncStatus === "synced" ? "secondary" : "outline"}>
                {note.syncStatus === "synced" ? "동기화됨" : "수동"}
              </Badge>
            </div>
            {fileError && <p className="mb-3 text-sm text-destructive">{fileError}</p>}
            {fileUrl && (
              <div className="mb-4 space-y-3">
                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  download={note.fileName}
                  className="inline-flex rounded-lg border px-3 py-2 text-sm font-medium text-primary hover:bg-primary/5"
                >
                  파일 열기 / 다운로드
                </a>
                {isImage && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={fileUrl}
                    alt={note.fileName ?? note.title}
                    className="max-h-[60vh] w-full object-contain"
                  />
                )}
                {isPdf && (
                  <iframe
                    src={fileUrl}
                    title={note.fileName ?? note.title}
                    className="h-[60vh] w-full rounded-lg border"
                  />
                )}
              </div>
            )}
            <p className="whitespace-pre-wrap text-sm leading-7 text-foreground">
              {note.content || "저장된 노트 내용이 없습니다."}
            </p>
          </div>

          {note.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {note.tags.map((tag) => (
                <Badge key={tag} variant="outline">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
