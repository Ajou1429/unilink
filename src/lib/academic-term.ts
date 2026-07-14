export const KOREA_TIME_ZONE = "Asia/Seoul";

function getKoreanYearMonth(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: KOREA_TIME_ZONE,
    year: "numeric",
    month: "numeric",
  }).formatToParts(date);

  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
  };
}

export function getCurrentAcademicTermLabel(date = new Date()) {
  const { year, month } = getKoreanYearMonth(date);

  if (month === 1 || month === 2) {
    return `${year}년 겨울학기`;
  }

  if (month === 7 || month === 8) {
    return `${year}년 여름학기`;
  }

  if (month >= 3 && month <= 6) {
    return `${year}년 1학기`;
  }

  return `${year}년 2학기`;
}

export function getAcademicTermOptions(date = new Date(), extraTerms: string[] = []) {
  const { year } = getKoreanYearMonth(date);
  const baseTerms = [
    `${year}년 겨울학기`,
    `${year}년 1학기`,
    `${year}년 여름학기`,
    `${year}년 2학기`,
  ];

  return Array.from(new Set([...baseTerms, ...extraTerms]));
}
