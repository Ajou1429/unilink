/** 대시보드 인사말. 한국 시간 기준 시간대별로 몇 가지 문구를 두고, 날짜마다 돌아가며 보여준다. */

const GREETINGS: { from: number; to: number; lines: string[] }[] = [
  {
    from: 0, to: 5,
    lines: [
      "새벽까지 공부 중이시군요, {name}님",
      "조용한 새벽이네요, {name}님. 무리하지 마세요",
      "이 시간까지 수고 많아요, {name}님",
    ],
  },
  {
    from: 5, to: 9,
    lines: [
      "좋은 아침이에요, {name}님",
      "일찍 시작하셨네요, {name}님",
      "상쾌한 아침이에요, {name}님",
    ],
  },
  {
    from: 9, to: 12,
    lines: [
      "좋은 오전이에요, {name}님",
      "오늘도 힘차게 시작해요, {name}님",
    ],
  },
  {
    from: 12, to: 14,
    lines: [
      "점심은 챙겨 드셨나요, {name}님?",
      "든든하게 드시고 이어가요, {name}님",
    ],
  },
  {
    from: 14, to: 18,
    lines: [
      "오후도 힘내요, {name}님",
      "조금만 더 집중해 봐요, {name}님",
      "나른한 오후네요, {name}님",
    ],
  },
  {
    from: 18, to: 22,
    lines: [
      "오늘 하루도 수고 많았어요, {name}님",
      "저녁 시간이에요, {name}님",
      "하루 마무리 잘하고 계신가요, {name}님?",
    ],
  },
  {
    from: 22, to: 24,
    lines: [
      "늦은 저녁에도 열심히 하시는군요, {name}님",
      "오늘도 끝까지 해내는 중이네요, {name}님",
      "푹 쉬는 것도 공부예요, {name}님",
    ],
  },
];

function koreaParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour") };
}

export function getGreeting(name: string, date = new Date()) {
  const { year, month, day, hour } = koreaParts(date);
  const slot = GREETINGS.find((item) => hour >= item.from && hour < item.to) ?? GREETINGS[0];
  // 같은 날·같은 시간대에는 같은 문구, 날이 바뀌면 다른 문구
  const index = (year * 372 + month * 31 + day) % slot.lines.length;
  return slot.lines[index].replace("{name}", name);
}
