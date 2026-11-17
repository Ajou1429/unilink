import type { HistoryItem } from "./chat-history";

export function conciseChatTitle(value: string | null | undefined): string | undefined {
  const title = value?.normalize("NFC").replace(/^\s*#{1,6}\s*/, "").trim();
  if (!title || title.length > 60 || /[\r\n]/.test(title) || /(?:\d{1,2}\s*(?:월|일|시|분)|\d{4}-|동안|(?:봐|이야|거야|있어|봤어|예정이야|했어)[.!?]?\s*$|해\s*줘|해주|해\s*주세요|등록해|만들어|알려줘|분석해|우리\s*조는)/.test(title)) return undefined;
  return title;
}

/** Name the subject, rather than using an instruction sentence as a heading. */
export function conversationTitle(items: HistoryItem[]): string {
  const first = items.find(item => item.kind === "user");
  const file = first?.fileNames?.map(name => conciseChatTitle(name.replace(/\.[^.]+$/, "").replace(/_/g, " "))).find(Boolean);
  if (file) return file;
  for (const item of items) {
    if (item.card?.title) return item.card.title;
    if (item.kind !== "archive" || !item.text.startsWith("요청 내역 · ")) continue;
    const title = conciseChatTitle(item.text.split("\n")[1]);
    if (title) return title;
  }
  return conciseChatTitle(first?.text) ?? "학습 요청";
}
