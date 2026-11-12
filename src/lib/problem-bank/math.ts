// 문제 본문을 글 / 인라인 수식($…$) / 블록 수식($$…$$, \[…\])으로 나눈다. \$는 달러 기호 그대로.
export type MathPart = { type: "text" | "inline" | "display"; value: string };

export function splitMath(text: string): MathPart[] {
  const parts: MathPart[] = [];
  let buffer = "";
  const flush = () => { if (buffer) parts.push({ type: "text", value: buffer }); buffer = ""; };
  let i = 0;
  while (i < text.length) {
    if (text[i] === "\\" && text[i + 1] === "$") { buffer += "$"; i += 2; continue; }
    const display = text.startsWith("$$", i) ? "$$" : text.startsWith("\\[", i) ? "\\[" : null;
    if (display) {
      const close = display === "$$" ? "$$" : "\\]";
      const end = text.indexOf(close, i + 2);
      if (end > i + 2) { flush(); parts.push({ type: "display", value: text.slice(i + 2, end).trim() }); i = end + 2; continue; }
    }
    if (text[i] === "$") {
      let end = i + 1;
      while (end < text.length && (text[end] !== "$" || text[end - 1] === "\\")) end++;
      // 같은 줄 안에서 닫히는 $만 수식으로 본다(가격 표기 "$5"가 뒤 문장을 삼키지 않도록)
      if (end < text.length && end > i + 1 && !text.slice(i + 1, end).includes("\n")) {
        flush(); parts.push({ type: "inline", value: text.slice(i + 1, end) }); i = end + 1; continue;
      }
    }
    buffer += text[i];
    i++;
  }
  flush();
  return parts;
}
