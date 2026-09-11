"use client";

import { useEffect, useState, type PointerEvent as ReactPointerEvent } from "react";
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
import { fetchDrivePdf } from "@/lib/drive-connection";
import {
  CalendarClock,
  ExternalLink,
  FileText,
  HardDrive,
  Maximize2,
  Minimize2,
  Scaling,
} from "lucide-react";

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
  const [expanded, setExpanded] = useState(false);
  const [dialogSize, setDialogSize] = useState<{ width: number; height: number } | null>(null);

  function startResizing(event: ReactPointerEvent<HTMLButtonElement>) {
    const dialog = event.currentTarget.closest<HTMLElement>("[data-slot='dialog-content']");
    if (!dialog || expanded) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startY = event.clientY;
    const startBounds = dialog.getBoundingClientRect();
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";

    const resize = (moveEvent: PointerEvent) => {
      const maxWidth = Math.max(320, window.innerWidth - 32);
      const maxHeight = Math.max(320, window.innerHeight - 32);
      const minWidth = Math.min(420, maxWidth);
      const minHeight = Math.min(420, maxHeight);

      setDialogSize({
        width: Math.min(
          maxWidth,
          Math.max(minWidth, startBounds.width + (moveEvent.clientX - startX) * 2),
        ),
        height: Math.min(
          maxHeight,
          Math.max(minHeight, startBounds.height + (moveEvent.clientY - startY) * 2),
        ),
      });
    };

    const stopResizing = () => {
      window.removeEventListener("pointermove", resize);
      window.removeEventListener("pointerup", stopResizing);
      window.removeEventListener("pointercancel", stopResizing);
      document.body.style.userSelect = previousUserSelect;
    };

    window.addEventListener("pointermove", resize);
    window.addEventListener("pointerup", stopResizing);
    window.addEventListener("pointercancel", stopResizing);
  }

  useEffect(() => {
    let cancelled = false;
    if (note.filePath && !note.fileDataUrl) {
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
    }

    const isDrivePdf = note.fileName?.toLowerCase().endsWith(".pdf");
    if (!note.driveFileId || !isDrivePdf) return;

    let objectUrl: string | null = null;
    fetchDrivePdf(note.driveFileId)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setFileUrl(objectUrl);
      })
      .catch((error) => {
        if (!cancelled) {
          setFileError(error instanceof Error ? error.message : "Drive PDF를 불러오지 못했습니다.");
        }
      })

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [note.driveFileId, note.fileDataUrl, note.fileName, note.filePath]);

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
      <DialogContent
        className="flex flex-col overflow-hidden sm:max-w-none"
        style={{
          width: expanded
            ? "calc(100vw - 2rem)"
            : dialogSize
              ? `${dialogSize.width}px`
              : "min(960px, calc(100vw - 2rem))",
          height: expanded
            ? "calc(100dvh - 2rem)"
            : dialogSize
              ? `${dialogSize.height}px`
              : "82dvh",
          maxWidth: "calc(100vw - 2rem)",
          maxHeight: "calc(100dvh - 2rem)",
          minWidth: "min(360px, calc(100vw - 2rem))",
          minHeight: "min(360px, calc(100dvh - 2rem))",
          containerType: "size",
        }}
      >
        <DialogHeader className="shrink-0 min-w-0 pr-16">
          <DialogTitle className="break-words leading-snug">{note.title}</DialogTitle>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="absolute right-11 top-2"
            title={expanded ? "원래 크기로" : "크게 보기"}
            aria-label={expanded ? "원래 크기로" : "크게 보기"}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? <Minimize2 /> : <Maximize2 />}
          </Button>
        </DialogHeader>

        <div className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden [overflow-wrap:anywhere]">
          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
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
              <div className="flex min-w-0 max-w-full flex-wrap gap-1.5 sm:max-w-[40%]">
                <Badge variant="secondary" className="h-auto whitespace-normal break-words">{note.linkedTitle ?? note.courseName}</Badge>
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
                    className="w-full rounded-lg border"
                    style={{ height: "max(280px, calc(100cqh - 240px))" }}
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
        {!expanded && (
          <button
            type="button"
            className="absolute bottom-1 right-1 z-20 flex h-8 w-8 touch-none cursor-nwse-resize items-center justify-center rounded-md bg-background/90 text-muted-foreground shadow-sm ring-1 ring-border hover:bg-muted hover:text-foreground"
            title="드래그해서 창 크기 조절"
            aria-label="드래그해서 창 크기 조절"
            onPointerDown={startResizing}
          >
            <Scaling className="h-4 w-4" />
          </button>
        )}
      </DialogContent>
    </Dialog>
  );
}
