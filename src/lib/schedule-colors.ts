export const SCHEDULE_COLOR_OPTIONS = [
  { value: "#2563EB", label: "파랑" },
  { value: "#4F46E5", label: "남색" },
  { value: "#7C3AED", label: "보라" },
  { value: "#9333EA", label: "자주" },
  { value: "#DB2777", label: "분홍" },
  { value: "#F43F5E", label: "장미" },
  { value: "#BE123C", label: "진한 장미" },
  { value: "#DC2626", label: "빨강" },
  { value: "#EA580C", label: "주황" },
  { value: "#D97706", label: "황토" },
  { value: "#65A30D", label: "연두" },
  { value: "#16A34A", label: "초록" },
  { value: "#059669", label: "에메랄드" },
  { value: "#0F766E", label: "진한 청록" },
  { value: "#0891B2", label: "청록" },
  { value: "#64748B", label: "회색" },
] as const;

export const SCHEDULE_COLORS: string[] = SCHEDULE_COLOR_OPTIONS.map((option) => option.value);
