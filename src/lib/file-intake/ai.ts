import { getSupabaseBrowserClient } from "../supabase-client";
import { getStorageUser } from "../private-storage";
import type { DocType } from "./classify-local";
import type { SyllabusInfo } from "./syllabus";

export interface AiClassification {
  doc_type: DocType;
  course_id: string | null;
  course_name: string | null;
  course_code: string | null;
}

export interface AiCourseHint {
  id: string;
  name: string;
  code: string | null;
}

interface Payload {
  fileName: string;
  text: string;
  image?: string;
  courses?: AiCourseHint[];
}

/** 로그인한 계정에서만 서버 분류를 쓸 수 있다 (데모·비로그인은 브라우저 분류만) */
export async function aiClassificationAvailable(): Promise<boolean> {
  const db = getSupabaseBrowserClient();
  if (!db) return false;
  const user = (await db.auth.getUser()).data.user;
  return Boolean(user && getStorageUser() === user.id);
}

async function invoke<T>(mode: "classify" | "syllabus", payload: Payload): Promise<T> {
  const db = getSupabaseBrowserClient();
  if (!db) throw new Error("로그인이 필요합니다.");
  const { data, error } = await db.functions.invoke<{ result: T }>("file-classify", {
    body: { mode, consent: true, fileName: payload.fileName, text: payload.text, image: payload.image ?? null, courses: payload.courses ?? [] },
  });
  if (error || !data?.result) {
    let message = "AI 분류를 하지 못했습니다.";
    try {
      const context = (error as { context?: Response } | null)?.context;
      const body = context ? await context.json() : null;
      if (typeof body?.error === "string") message = body.error;
    } catch {
      // 기본 메시지 사용
    }
    throw new Error(message);
  }
  return data.result;
}

export function classifyWithAi(payload: Payload) {
  return invoke<AiClassification>("classify", payload);
}

export function extractSyllabusWithAi(payload: Payload) {
  return invoke<SyllabusInfo>("syllabus", payload);
}
