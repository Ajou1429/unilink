"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import type { ProblemContent } from "@/lib/problem-bank-storage";
import { cropUrl } from "@/lib/problem-bank/images";
import { MathText } from "./MathText";

function Crop({ src, w, h }: { src: string; w: number; h: number }) {
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    void cropUrl(src).then((value) => { if (alive) setUrl(value); });
    return () => { alive = false; };
  }, [src]);
  if (url === undefined) return <div className="flex h-24 items-center justify-center"><Loader2 className="h-4 w-4 animate-spin text-slate-400" /></div>;
  if (!url) return <p className="text-xs text-rose-600">그림을 불러오지 못했어요.</p>;
  // 크롭은 화면보다 2배 이상 크게 렌더링해 두었으므로 절반 크기로 보여 주면 선명하다
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="문제 그림" width={w} height={h} className="h-auto rounded-md border bg-white" style={{ width: `min(100%, ${Math.round(w / 2)}px)` }} />;
}

/** 번호를 누르면 펼쳐지는 문제 본문: 글(수식 포함) + 크롭 그림 */
export function ProblemDetail({ content, onConfirm, onRemove }: {
  content: ProblemContent | null | undefined;
  onConfirm: () => void;
  onRemove: () => void;
}) {
  if (!content) {
    return <p className="py-2 text-[13px] text-slate-500">문제 내용이 아직 없어요. 같은 PDF를 다시 올리면 채워져요.</p>;
  }
  return (
    <div className="space-y-3 py-2">
      {content.check && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
          <AlertTriangle size={15} className="shrink-0" />
          <span className="min-w-0 flex-1">
            {content.origin === "rule" ? "AI는 이 번호를 찾지 못했어요." : content.origin === "ai" ? "PDF 글자에서는 이 번호를 찾지 못했어요." : ""} 원본과 번호가 맞는지 확인해 주세요.
          </span>
          <button type="button" onClick={onConfirm} className="rounded-md bg-amber-600 px-2.5 py-1 text-xs font-medium text-white">번호 맞음</button>
          <button type="button" onClick={onRemove} className="rounded-md border border-amber-300 bg-white px-2.5 py-1 text-xs">삭제</button>
        </div>
      )}
      {content.text && <MathText text={content.text} className="text-[15px] leading-7 text-slate-800 [&_.katex-display]:my-2 [&_.katex-display]:overflow-x-auto" />}
      {content.images.map((image) => <Crop key={image.src} {...image} />)}
      {!content.text && !content.images.length && <p className="text-[13px] text-slate-500">문제 영역을 찾지 못했어요.</p>}
    </div>
  );
}
