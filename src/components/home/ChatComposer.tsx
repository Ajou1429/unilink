"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, FileText, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { INTAKE_ACCEPT } from "@/lib/file-intake/extract";

export interface ComposerSubmit {
  text: string;
  files: File[];
}

/** 채팅 입력창. 글 입력, + 버튼으로 파일 첨부, 입력창이나 화면 어디에든 파일을 끌어다 놓을 수 있다. */
export function ChatComposer({
  onSubmit,
  footer,
  autoFocus,
}: {
  onSubmit: (value: ComposerSubmit) => void;
  /** 입력창 아래 줄 왼쪽에 둘 추가 요소 (예: Drive 저장) */
  footer?: React.ReactNode;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);

  // 입력한 줄 수에 맞춰 높이 조절 (최대 약 8줄)
  useEffect(() => {
    const element = textarea.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 200)}px`;
  }, [text]);

  // 화면 어디에 끌어다 놓아도 첨부된다
  useEffect(() => {
    let depth = 0;
    const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes("Files");
    const enter = (event: DragEvent) => { if (!hasFiles(event)) return; depth += 1; setDragging(true); };
    const leave = (event: DragEvent) => { if (!hasFiles(event)) return; depth = Math.max(0, depth - 1); if (!depth) setDragging(false); };
    const over = (event: DragEvent) => { if (hasFiles(event)) event.preventDefault(); };
    const drop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth = 0;
      setDragging(false);
      const dropped = Array.from(event.dataTransfer?.files ?? []);
      if (dropped.length) setFiles((prev) => [...prev, ...dropped]);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, []);

  const canSend = Boolean(text.trim() || files.length);

  function submit() {
    if (!canSend) return;
    onSubmit({ text: text.trim(), files });
    setText("");
    setFiles([]);
  }

  return (
    <>
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-primary/10 backdrop-blur-[1px]">
          <div className="rounded-2xl border-2 border-dashed border-primary bg-white/90 px-8 py-6 text-center shadow-lg">
            <p className="text-base font-semibold">여기에 놓으면 첨부돼요</p>
            <p className="mt-1 text-sm text-muted-foreground">PDF · 이미지 · PPTX · DOCX</p>
          </div>
        </div>
      )}
      <div
        className={cn(
          "w-full rounded-2xl border bg-white shadow-sm transition-shadow focus-within:shadow-md",
          dragging && "border-primary",
        )}
      >
        {files.length > 0 && (
          <ul className="flex flex-wrap gap-2 px-3 pt-3" aria-label="첨부한 파일">
            {files.map((file, index) => (
              <li key={`${file.name}-${index}`} className="flex max-w-56 items-center gap-2 rounded-lg border bg-muted/40 py-1.5 pl-2 pr-1 text-xs">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate" title={file.name}>{file.name}</span>
                <button
                  type="button"
                  aria-label={`${file.name} 첨부 취소`}
                  onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))}
                  className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <textarea
          ref={textarea}
          rows={1}
          autoFocus={autoFocus}
          value={text}
          aria-label="메시지 입력"
          placeholder="무엇을 도와드릴까요?"
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            }
          }}
          className="block min-h-14 w-full resize-none bg-transparent px-4 pt-4 text-[15px] outline-none placeholder:text-muted-foreground"
        />
        <div className="flex items-center gap-2 px-3 pb-3 pt-1">
          <input
            ref={picker}
            type="file"
            multiple
            accept={INTAKE_ACCEPT}
            className="sr-only"
            aria-label="파일 첨부"
            onChange={(event) => {
              // 아래에서 입력값을 비우기 전에 파일 목록을 먼저 복사해 둔다 (상태 갱신이 늦게 실행될 수 있음)
              const picked = Array.from(event.target.files ?? []);
              event.target.value = "";
              if (picked.length) setFiles((prev) => [...prev, ...picked]);
            }}
          />
          <button
            type="button"
            onClick={() => picker.current?.click()}
            aria-label="파일 첨부"
            title="파일 첨부"
            className="flex size-8 items-center justify-center rounded-lg border text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Plus className="h-4 w-4" />
          </button>
          {footer}
          <div className="flex-1" />
          <button
            type="button"
            onClick={submit}
            disabled={!canSend}
            aria-label="보내기"
            className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity disabled:opacity-30"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        </div>
      </div>
    </>
  );
}
