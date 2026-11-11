"use client";

import { useState } from "react";
import { formatGpa, MAX_GPA } from "@/lib/record-storage";

// 데이터 시각화 기본 팔레트의 1·2번 범주색 (검증된 순서)
const SERIES = [
  { key: "gpa", label: "전체", color: "#2a78d6" },
  { key: "majorGpa", label: "전공", color: "#eb6834" },
] as const;

export interface TermPoint {
  term: string;
  gpa: number | null;
  majorGpa: number | null;
}

const W = 520;
const H = 180;
const PAD = { top: 12, right: 16, bottom: 28, left: 32 };
const TICKS = [0, 1.5, 3, 4.5];

function shortTerm(term: string) {
  const match = /^(\d+)학년 (\d|여름|겨울)학기$/.exec(term);
  return match ? `${match[1]}-${match[2]}` : term;
}

export function GpaLineChart({ points }: { points: TermPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (index: number) => PAD.left + (points.length === 1 ? innerW / 2 : (index / (points.length - 1)) * innerW);
  const y = (value: number) => PAD.top + innerH - (value / MAX_GPA) * innerH;
  const hasData = points.some((point) => point.gpa !== null);

  return (
    <div className="relative">
      <div className="mb-1 flex items-center gap-3 text-xs text-muted-foreground" aria-hidden>
        {SERIES.map((series) => (
          <span key={series.key} className="flex items-center gap-1.5">
            <span className="h-0.5 w-3 rounded" style={{ backgroundColor: series.color }} />
            {series.label}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="학기별 평점 추이">
        {TICKS.map((tick) => (
          <g key={tick}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} stroke="#e5e7eb" strokeWidth={1} />
            <text x={PAD.left - 6} y={y(tick) + 3} textAnchor="end" fontSize={10} fill="#6b7280">{tick.toFixed(1)}</text>
          </g>
        ))}
        {points.map((point, index) => (
          <text key={point.term} x={x(index)} y={H - 8} textAnchor="middle" fontSize={10} fill="#6b7280">{shortTerm(point.term)}</text>
        ))}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} stroke="#9ca3af" strokeWidth={1} />}
        {hasData && SERIES.map((series) => {
          const defined = points.map((point, index) => ({ index, value: point[series.key] })).filter((point) => point.value !== null) as { index: number; value: number }[];
          const path = defined.map((point, i) => `${i ? "L" : "M"}${x(point.index)},${y(point.value)}`).join(" ");
          return (
            <g key={series.key}>
              <path d={path} fill="none" stroke={series.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {defined.map((point) => (
                <circle key={point.index} cx={x(point.index)} cy={y(point.value)} r={hover === point.index ? 5 : 4} fill={series.color} stroke="#fff" strokeWidth={2} />
              ))}
            </g>
          );
        })}
        {/* 마우스·터치 대상: 칸 전체 */}
        {points.map((point, index) => {
          const half = points.length > 1 ? innerW / (points.length - 1) / 2 : innerW / 2;
          return (
            <rect
              key={point.term}
              x={x(index) - half}
              y={PAD.top}
              width={half * 2}
              height={innerH}
              fill="transparent"
              onMouseEnter={() => setHover(index)}
              onMouseLeave={() => setHover(null)}
              onTouchStart={() => setHover(index)}
            />
          );
        })}
      </svg>
      {!hasData && <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">성적을 입력하면 추이가 표시됩니다.</p>}
      {hover !== null && points[hover] && (
        <div
          className="pointer-events-none absolute top-6 z-10 -translate-x-1/2 rounded-md border bg-white px-2.5 py-1.5 text-xs shadow-sm"
          style={{ left: `${(x(hover) / W) * 100}%` }}
        >
          <p className="font-semibold">{points[hover].term}</p>
          {SERIES.map((series) => (
            <p key={series.key} className="flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: series.color }} />
              {series.label} <span className="ml-auto pl-2 font-medium text-foreground">{formatGpa(points[hover][series.key])}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

export function GradeDistribution({ items }: { items: { grade: string; credits: number; ratio: number }[] }) {
  if (!items.length) return <p className="py-6 text-center text-sm text-muted-foreground">입력한 성적이 없어요.</p>;
  return (
    <ul className="space-y-1.5" aria-label="성적 비율">
      {items.map((item) => (
        <li key={item.grade} className="grid grid-cols-[28px_1fr_36px] items-center gap-2 text-xs" title={`${item.grade} ${item.credits}학점`}>
          <span className="font-semibold">{item.grade}</span>
          <span className="h-2 rounded-full bg-muted">
            <span className="block h-2 rounded-full bg-[#2a78d6]" style={{ width: `${Math.max(item.ratio * 100, 2)}%` }} />
          </span>
          <span className="text-right text-muted-foreground">{Math.round(item.ratio * 100)}%</span>
        </li>
      ))}
    </ul>
  );
}
