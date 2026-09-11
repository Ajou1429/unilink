import { Check } from "lucide-react";
import { SCHEDULE_COLOR_OPTIONS } from "@/lib/schedule-colors";

interface ScheduleColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  labelPrefix?: string;
}

export function ScheduleColorPicker({
  value,
  onChange,
  labelPrefix = "일정",
}: ScheduleColorPickerProps) {
  return (
    <div className="grid w-fit grid-cols-8 gap-2">
      {SCHEDULE_COLOR_OPTIONS.map((option) => {
        const selected = value.toLowerCase() === option.value.toLowerCase();

        return (
          <button
            key={option.value}
            type="button"
            aria-label={`${labelPrefix} ${option.label} 색상 선택`}
            title={option.label}
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={`flex h-7 w-7 items-center justify-center rounded-full text-white transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
              selected
                ? "scale-110 ring-2 ring-foreground/50 ring-offset-2"
                : "hover:scale-110"
            }`}
            style={{ backgroundColor: option.value }}
          >
            {selected && <Check className="h-4 w-4 stroke-[3]" />}
          </button>
        );
      })}
    </div>
  );
}
