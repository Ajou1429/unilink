// PPTX·DOCX(ZIP)에서 필요한 XML만 꺼내는 최소 리더. 외부 라이브러리 없이 브라우저/Node의
// DecompressionStream("deflate-raw")를 쓴다. 암호화·ZIP64·분할 압축은 지원하지 않는다.

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const MAX_ENTRY_BYTES = 8 * 1024 * 1024;

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** ZIP 안의 파일 중 accept(name)이 true인 항목만 풀어서 돌려준다. */
export async function readZipEntries(bytes: Uint8Array, accept: (name: string) => boolean): Promise<Map<string, Uint8Array>> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === EOCD_SIGNATURE) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("ZIP 형식이 아닙니다.");
  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const result = new Map<string, Uint8Array>();
  for (let n = 0; n < count; n++) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== CENTRAL_SIGNATURE) break;
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const size = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;
    if (!accept(name) || size > MAX_ENTRY_BYTES) continue;
    if (view.getUint32(localOffset, true) !== LOCAL_SIGNATURE) continue;
    const dataStart = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
    const raw = bytes.subarray(dataStart, dataStart + compressedSize);
    if (method === 0) result.set(name, raw);
    else if (method === 8) result.set(name, await inflateRaw(raw));
  }
  return result;
}

/** OOXML에서 텍스트 노드(<a:t>, <w:t>)를 순서대로 모은다. 문단 끝은 줄바꿈으로. */
export function ooxmlText(xml: string): string {
  return xml
    .replace(/<\/(a:p|w:p)>/g, "\n")
    .replace(/<(a|w):tab\/>/g, " ")
    .match(/<(a|w):t(?:\s[^>]*)?>[^<]*<\/(a|w):t>|\n/g)
    ?.map((part) => (part === "\n" ? "\n" : part.replace(/<[^>]+>/g, "")))
    .join("")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&apos;/g, "'").replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim() ?? "";
}

/** ppt/slides/slide12.xml → 12 */
export function slideNumber(name: string) {
  return Number(/slide(\d+)\.xml$/.exec(name)?.[1] ?? Number.MAX_SAFE_INTEGER);
}
