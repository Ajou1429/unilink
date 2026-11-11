export const KOREA_TIME_ZONE = "Asia/Seoul";

/** 한 학년도 안의 학기 순서 (겨울학기는 그해 2학기 다음, 12월~이듬해 2월) */
export const TERM_SEASONS = ["1학기", "여름학기", "2학기", "겨울학기"] as const;
export type TermSeason = (typeof TERM_SEASONS)[number];

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

export function formatAcademicTerm(year: number, season: TermSeason) {
  return `${year}년 ${season}`;
}

export function parseAcademicTerm(term: string): { year: number; season: TermSeason } | null {
  const match = /^(\d{4})년 (.+)$/.exec(term.trim());
  if (!match) return null;
  const season = TERM_SEASONS.find((item) => item === match[2]);
  return season ? { year: Number(match[1]), season } : null;
}

export function getCurrentAcademicTermLabel(date = new Date()) {
  const { year, month } = getKoreanYearMonth(date);

  // 1~2월은 직전 학년도의 겨울학기
  if (month === 1 || month === 2) return formatAcademicTerm(year - 1, "겨울학기");
  if (month === 7 || month === 8) return formatAcademicTerm(year, "여름학기");
  if (month >= 3 && month <= 6) return formatAcademicTerm(year, "1학기");
  return formatAcademicTerm(year, "2학기");
}

/** 연도 → 1학기 → 여름학기 → 2학기 → 겨울학기 순으로 정렬. 형식이 다른 학기명은 뒤로 보낸다. */
export function sortAcademicTerms(terms: string[]) {
  const rank = (term: string) => {
    const parsed = parseAcademicTerm(term);
    return parsed ? parsed.year * 10 + TERM_SEASONS.indexOf(parsed.season) : Number.POSITIVE_INFINITY;
  };
  return [...new Set(terms)].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, "ko"));
}

export function getAcademicTermOptions(date = new Date(), extraTerms: string[] = []) {
  const { year } = getKoreanYearMonth(date);
  const baseTerms = TERM_SEASONS.map((season) => formatAcademicTerm(year, season));
  return sortAcademicTerms([...baseTerms, getCurrentAcademicTermLabel(date), ...extraTerms]);
}
