"use client";

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
