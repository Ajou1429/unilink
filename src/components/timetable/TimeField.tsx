"use client";

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

export function TimeField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex min-w-0">
      <Input
        value={value}
        placeholder="09:00"
        inputMode="numeric"
        className="min-w-0 flex-1 rounded-r-none"
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => onChange(normalizeTimeInput(value, "09:00"))}
      />
      <select
        aria-label="시간 선택"
        value={TIME_OPTIONS.includes(value) ? value : ""}
        onChange={(event) => onChange(event.target.value)}
        className="w-20 cursor-pointer rounded-r-md border border-l-0 bg-background px-1.5 text-foreground outline-none focus:ring-2 focus:ring-ring"
      >
        <option value="" disabled>
          시간 선택
        </option>
        {TIME_OPTIONS.map((time) => (
          <option key={time} value={time}>
            {formatTimeShort(time)}
          </option>
        ))}
      </select>
    </div>
  );
}
