export class RequestError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

/** Enforce the limit while streaming, including requests without Content-Length. */
export async function readLimitedBody(req: Request | Response, limit: number, signal?: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  const declared = Number(req.headers.get("content-length"));
  if (declared > limit) throw new RequestError("요청 파일이 너무 큽니다.", 413);
  const reader = req.body?.getReader();
  if (!reader) throw new RequestError("요청 내용이 없습니다.");
  signal?.throwIfAborted();
  const cancel = () => { void reader.cancel(); };
  signal?.addEventListener("abort", cancel, { once: true });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      signal?.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new RequestError("요청 파일이 너무 큽니다.", 413);
      }
      chunks.push(value);
    }
  } finally { signal?.removeEventListener("abort", cancel); reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

export async function readSmallJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const value = JSON.parse(new TextDecoder().decode(await readLimitedBody(req, 16_384, AbortSignal.timeout(10_000))));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new RequestError("JSON 객체가 필요합니다.");
    return value;
  }
  catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError("올바른 JSON 요청이 필요합니다.");
  }
}
