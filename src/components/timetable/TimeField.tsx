"use client";

import { useEffect, useRef, useState } from "react";
import { Clock } from "lucide-react";
import { Input } from "@/components/ui/input";

export const TIME_OPTIONS = Array.from({ length: 48 }, (_, index) => {
  const hour = Math.floor(index / 2);
  const minute = index % 2 === 0 ? "00" : "30";
  return `${String(hour).padStart(2, "0")}:${minute}`;
});

export function formatTimeOption(time: string) {
  const [hourText, minute] = time.split(":");
  const hour = Number(hourText);
  const period = hour < 12 ? "오전" : "오후";
  const displayHour = hour % 12 || 12;
  return `${period} ${displayHour}:${minute} (${time})`;
}

function formatTimeShort(time: string) {
  const [hourText, minute] = time.split(":");
  const hour = Number(hourText);
  const period = hour < 12 ? "오전" : "오후";
  const displayHour = hour % 12 || 12;
  return `${period} ${displayHour}:${minute}`;
}

function normalizeTimeInput(value: string, fallback: string) {
  const trimmed = value.trim();
  const colonParts = trimmed.split(":");
  let hour = 0;
  let minute = 0;

  if (colonParts.length === 2) {
    hour = Number(colonParts[0]);
    minute = Number(colonParts[1]);
  } else {
    const digits = trimmed.replace(/\D/g, "");
    if (digits.length <= 2) {
      hour = Number(digits);
    } else if (digits.length === 3) {
      hour = Number(digits.slice(0, 1));
      minute = Number(digits.slice(1));
    } else if (digits.length >= 4) {
      hour = Number(digits.slice(0, 2));
      minute = Number(digits.slice(2, 4));
    }
  }

  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour > 23 || minute > 59) {
    return fallback;
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

const ROW_HEIGHT = 32;
const VISIBLE_ROWS = 6;
/** 휠 한 칸(보통 deltaY 100)에 한 줄만 움직이도록, 이만큼 쌓여야 한 줄 이동한다. 트랙패드의 작은 delta도 누적해서 처리한다. */
const WHEEL_STEP = 60;

/** 시간 목록. 브라우저 기본 select는 휠 한 칸에 여러 줄이 넘어가서, 휠 한 칸 = 한 줄로 직접 스크롤한다. */
function TimeList({ value, onPick, onClose }: { value: string; onPick: (time: string) => void; onClose: () => void }) {
  const listRef = useRef<HTMLDivElement>(null);
  const selectedIndex = Math.max(0, TIME_OPTIONS.indexOf(value));
  const [active, setActive] = useState(selectedIndex);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    // 선택된 시간이 위에서 셋째 줄쯤 오도록
    list.scrollTop = Math.max(0, selectedIndex - 2) * ROW_HEIGHT;
    list.focus();
    let pending = 0;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const delta = event.deltaMode === 1 ? event.deltaY * 40 : event.deltaY;
      // 마우스 휠 한 칸(큰 delta)은 정확히 한 줄, 트랙패드의 작은 delta는 모아서 한 줄
      if (Math.abs(delta) >= WHEEL_STEP) {
        pending = 0;
        list.scrollTop += Math.sign(delta) * ROW_HEIGHT;
        return;
      }
      pending += delta;
      if (Math.abs(pending) >= WHEEL_STEP) {
        list.scrollTop += Math.sign(pending) * ROW_HEIGHT;
        pending = 0;
      }
    };
    list.addEventListener("wheel", onWheel, { passive: false });
    return () => list.removeEventListener("wheel", onWheel);
  }, [selectedIndex]);

  function move(next: number) {
    const index = Math.min(TIME_OPTIONS.length - 1, Math.max(0, next));
    setActive(index);
    const list = listRef.current;
    if (!list) return;
    const top = index * ROW_HEIGHT;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (top + ROW_HEIGHT > list.scrollTop + list.clientHeight) list.scrollTop = top + ROW_HEIGHT - list.clientHeight;
  }

  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label="시간 선택"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown") { event.preventDefault(); move(active + 1); }
        else if (event.key === "ArrowUp") { event.preventDefault(); move(active - 1); }
        else if (event.key === "Enter") { event.preventDefault(); onPick(TIME_OPTIONS[active]); }
        else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
      }}
      className="absolute right-0 top-full z-50 mt-1 w-28 overflow-y-auto overscroll-contain rounded-md border bg-popover py-1 shadow-md outline-none"
      style={{ maxHeight: ROW_HEIGHT * VISIBLE_ROWS + 8 }}
    >
      {TIME_OPTIONS.map((time, index) => (
        <button
          key={time}
          type="button"
          role="option"
          aria-selected={time === value}
          tabIndex={-1}
          onMouseEnter={() => setActive(index)}
          onClick={() => onPick(time)}
          className={`flex w-full items-center px-2.5 text-left text-sm ${
            time === value ? "font-semibold text-primary" : ""
          } ${index === active ? "bg-accent" : ""}`}
          style={{ height: ROW_HEIGHT }}
        >
          {formatTimeShort(time)}
        </button>
      ))}
    </div>
  );
}

export function TimeField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <div ref={rootRef} className="relative flex min-w-0">
      <Input
        value={value}
        placeholder="09:00"
        inputMode="numeric"
        className="min-w-0 flex-1 rounded-r-none"
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => onChange(normalizeTimeInput(value, "09:00"))}
      />
      <button
        type="button"
        aria-label="시간 선택"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex w-10 shrink-0 items-center justify-center rounded-r-md border border-l-0 bg-background text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Clock className="h-4 w-4" />
      </button>
      {open && (
        <TimeList
          value={value}
          onClose={() => setOpen(false)}
          onPick={(time) => {
            onChange(time);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}
