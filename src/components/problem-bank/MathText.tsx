"use client";

import { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { splitMath } from "@/lib/problem-bank/math";

const escape = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** 문제 본문: 글은 그대로, $…$·$$…$$는 수학 기호(분수·루트·제곱 등)로 그린다 */
export function MathText({ text, className }: { text: string; className?: string }) {
  const html = useMemo(() => splitMath(text).map((part) => {
    if (part.type === "text") return escape(part.value).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br/>");
    return katex.renderToString(part.value, { displayMode: part.type === "display", throwOnError: false, strict: "ignore", trust: false, output: "html" });
  }).join(""), [text]);
  // katex 결과와 이스케이프한 글만 넣는다
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
