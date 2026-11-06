import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.116.0";
import { RequestError } from "./requestLimits.ts";
export type CoachingSettings = {
  knowledge_enabled: boolean; research_enabled: boolean; topic_check_enabled: boolean;
  analysis_model: string | null; research_model: string | null;
  synthesis_model?: string | null;
};
export async function loadCoachingSettings(db: SupabaseClient): Promise<CoachingSettings> {
  const result = await db.from("coaching_service_settings")
    .select("knowledge_enabled,research_enabled,topic_check_enabled,analysis_model,research_model,synthesis_model").eq("singleton", true).single();
  if (result.error || !result.data) throw new RequestError("코칭 서비스 설정을 확인하지 못했습니다.", 503);
  return result.data as CoachingSettings;
}
export function synthesisModel(env: (key: string) => string | undefined, settings: CoachingSettings) {
  return env("COACHING_SYNTHESIS_MODEL") ?? settings.synthesis_model ?? env("COACHING_MODEL");
}
// An explicit environment setting wins, including an emergency false override.
export function featureEnabled(value: string | undefined, configured: boolean): boolean {
  return value === undefined ? configured : value === "true";
}
