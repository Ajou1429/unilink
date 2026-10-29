"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";

export function FileDropzone({ id, accept, multiple = false, disabled = false, onFiles }: {
  id?: string;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");

  function select(files: File[]) {
    if (disabled || !files.length) return;
    const types = accept?.split(",").map((type) => type.trim().toLowerCase());
    if ((!multiple && files.length > 1) || files.some((file) => types && !types.some((type) =>
      type.startsWith(".") ? file.name.toLowerCase().endsWith(type) :
        type.endsWith("/*") ? file.type.startsWith(type.slice(0, -1)) : file.type === type
    ))) {
      setError(!multiple && files.length > 1 ? "파일을 한 개씩 선택해 주세요." : "지원하는 파일 형식을 확인해 주세요.");
      return;
    }
    setError("");
    onFiles(files);
  }

  return (
    <div className="w-full space-y-2">
      <div
        onDragOver={(event) => { event.preventDefault(); if (!disabled) setDragging(true); }}
        onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
        onDrop={(event) => { event.preventDefault(); setDragging(false); select(Array.from(event.dataTransfer.files)); }}
        className={cn("rounded-xl border-2 border-dashed transition-colors", dragging ? "border-primary bg-primary/10" : "border-border bg-muted/30", disabled && "opacity-50")}
      >
        <input ref={input} id={id} type="file" accept={accept} multiple={multiple} disabled={disabled} className="sr-only"
          aria-label="업로드할 파일 선택" onChange={(event) => { select(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
        <button type="button" disabled={disabled} onClick={() => input.current?.click()}
          className="flex min-h-44 w-full flex-col items-center justify-center gap-2 rounded-xl px-5 py-8 text-center focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed">
          <Upload className="mb-1 h-7 w-7 text-muted-foreground" aria-hidden="true" />
          <span className="text-sm font-medium">{disabled ? "처리 중입니다…" : dragging ? "여기에 파일을 놓으세요" : "파일을 끌어다 놓거나 클릭해서 선택하세요"}</span>
          <span className="break-all text-xs text-muted-foreground">{accept || "모든 파일 형식"}{multiple ? " · 여러 파일 선택 가능" : " · 파일 1개"}</span>
        </button>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
