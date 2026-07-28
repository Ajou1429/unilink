import { FunctionsHttpError } from "@supabase/supabase-js";

/**
 * supabase-js는 Edge Function이 non-2xx를 반환하면 항상 같은 문구
 * ("Edge Function returned a non-2xx status code")만 던진다. 실제 원인은
 * 응답 본문({ error: "..." }, 우리 함수들의 jsonResponse 포맷)에 있으므로 꺼내온다.
 */
export async function describeFunctionError(error: unknown, fallback: string): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.clone().json();
      if (body?.error) return `${body.error} (HTTP ${error.context.status})`;
    } catch {
      // 본문이 JSON이 아니면 그냥 아래 fallback으로 진행
    }
    return `${fallback} (HTTP ${error.context.status})`;
  }
  return error instanceof Error ? error.message : fallback;
}
