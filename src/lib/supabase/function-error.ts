import { FunctionsHttpError } from "@supabase/supabase-js";

const GOOGLE_DRIVE_RECONNECT_MESSAGE =
  "Google Drive 연결 인증이 만료되었습니다. Google Drive를 다시 연결해주세요.";

function normalizeFunctionErrorMessage(message: string): string {
  if (
    message.includes("invalid_grant") ||
    (message.includes("Bad Request") && message.includes("Google access token"))
  ) {
    return GOOGLE_DRIVE_RECONNECT_MESSAGE;
  }

  return message;
}

/**
 * supabase-js는 Edge Function이 non-2xx를 반환하면 항상 같은 문구
 * ("Edge Function returned a non-2xx status code")만 던진다. 실제 원인은
 * 응답 본문({ error: "..." }, 우리 함수들의 jsonResponse 포맷)에 있으므로 꺼내온다.
 */
export async function describeFunctionError(error: unknown, fallback: string): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.clone().json();
      if (error.context.status === 404 && body?.code === "NOT_FOUND") {
        return "요청한 기능이 아직 서버에 배포되지 않았습니다. (HTTP 404)";
      }
      const message = typeof body?.error === "string" ? body.error : body?.message;
      if (typeof message === "string" && message.trim()) {
        return `${normalizeFunctionErrorMessage(message)} (HTTP ${error.context.status})`;
      }
    } catch {
      // 본문이 JSON이 아니면 그냥 아래 fallback으로 진행
    }
    return `${fallback} (HTTP ${error.context.status})`;
  }
  if (error instanceof Error && error.name === "FunctionsFetchError") {
    return "기능 서버에 연결하지 못했습니다. 네트워크 또는 서버 배포 상태를 확인해 주세요.";
  }
  return error instanceof Error ? normalizeFunctionErrorMessage(error.message) : fallback;
}
