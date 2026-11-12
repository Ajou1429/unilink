// 문제 크롭 그림 저장·불러오기.
// 로그인: 기존 note-files 저장소의 "<사용자>/problem-bank/…" (다른 기기에서도 보임)
// 비로그인·데모: 이 브라우저의 IndexedDB (용량이 큰 그림을 sessionStorage에 넣지 않는다)
import { getSupabaseBrowserClient } from "../supabase-client";
import { getStorageUser } from "../private-storage";

const BUCKET = "note-files";
const DB_NAME = "unilink-problem-images";
const STORE = "images";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idb<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = run(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

async function signedIn() {
  const db = getSupabaseBrowserClient();
  if (!db) return null;
  const user = (await db.auth.getUser()).data.user;
  return user && getStorageUser() === user.id ? { db, userId: user.id } : null;
}

export async function saveCrop(blob: Blob): Promise<string> {
  const id = crypto.randomUUID();
  const session = await signedIn();
  if (session) {
    const path = `${session.userId}/problem-bank/${id}.webp`;
    const { error } = await session.db.storage.from(BUCKET).upload(path, blob, { contentType: blob.type || "image/webp", upsert: false });
    if (error) throw new Error("문제 그림을 저장하지 못했습니다.");
    return `storage:${path}`;
  }
  await idb("readwrite", (store) => store.put(blob, id));
  return `idb:${id}`;
}

const urlCache = new Map<string, Promise<string | null>>();

/** 화면에 띄울 주소. 저장소 그림은 1시간짜리 서명 주소를 쓴다. */
export function cropUrl(src: string): Promise<string | null> {
  const cached = urlCache.get(src);
  if (cached) return cached;
  const task = (async () => {
    if (src.startsWith("storage:")) {
      const db = getSupabaseBrowserClient();
      if (!db) return null;
      const { data } = await db.storage.from(BUCKET).createSignedUrl(src.slice(8), 3600);
      return data?.signedUrl ?? null;
    }
    if (src.startsWith("idb:")) {
      const blob = await idb<Blob | undefined>("readonly", (store) => store.get(src.slice(4)) as IDBRequest<Blob | undefined>);
      return blob ? URL.createObjectURL(blob) : null;
    }
    return null;
  })().catch(() => null);
  urlCache.set(src, task);
  return task;
}

/** 문항·파일을 지울 때 그림도 지운다(실패해도 문항 삭제는 계속) */
export async function removeCrops(srcs: string[]) {
  const storage = srcs.filter((src) => src.startsWith("storage:")).map((src) => src.slice(8));
  const local = srcs.filter((src) => src.startsWith("idb:")).map((src) => src.slice(4));
  try {
    if (storage.length) await getSupabaseBrowserClient()?.storage.from(BUCKET).remove(storage);
    for (const key of local) await idb("readwrite", (store) => store.delete(key));
  } catch {
    // 그림 정리는 다음 기회에
  }
}
