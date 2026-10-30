import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.116.0";
import { RequestError } from "./requestLimits.ts";
import { featureEnabled, type CoachingSettings } from "./coachingSettings.ts";
import { planKnowledge, knowledgeContext, type KnowledgeNote, type KnowledgeTask, type Progress } from "./courseKnowledge.ts";

export async function loadKnowledge(db: SupabaseClient, userId: string, goalId: string, asOf: string, model: string, searchModel: string | null) {
  const goal = await db.from("learning_goals").select("id,title,course_id,goal_type,metadata").eq("id", goalId).eq("user_id", userId).eq("status", "active").single();
  if (goal.error || !goal.data) throw new RequestError("학습 목표를 확인해 주세요.", 404);
  const aliases = new Set<string>([goal.data.id]);
  const metadata = goal.data.metadata?.legacy_record ?? {};
  if (typeof metadata.id === "string") aliases.add(metadata.id);
  if (goal.data.course_id) {
    aliases.add(goal.data.course_id);
    if (typeof metadata.courseId === "string") aliases.add(metadata.courseId);
    const course = await db.from("courses").select("metadata").eq("id", goal.data.course_id).eq("user_id", userId).single();
    if (course.error) throw new RequestError("수업 정보를 확인하지 못했습니다.", 503);
    const legacyId = course.data.metadata?.legacy_record?.id;
    if (typeof legacyId === "string") aliases.add(legacyId);
  }
  const notesResult = await db.from("notes").select("id,title,version,updated_at,file_path,file_name,drive_file_id,drive_modified_time")
    .eq("user_id", userId).eq("linked_type", goal.data.course_id ? "course" : "personal").in("linked_id", [...aliases]).order("id").limit(41);
  const artifacts = await db.from("course_knowledge_tasks").select("id,task_key,kind,status,note_id,source_revision,source_hash,page_start,page_end,payload,error_message,created_at")
    .eq("user_id", userId).eq("goal_id", goalId).order("created_at", { ascending: false }).limit(1501);
  const progressResult = goal.data.course_id ? await db.from("course_sessions").select("id,session_date,memo,metadata")
    .eq("user_id", userId).eq("course_id", goal.data.course_id).lte("session_date", asOf).order("session_date", { ascending: false }).limit(101) : { data: [], error: null };
  if (notesResult.error || artifacts.error || progressResult.error) throw new RequestError("과목 지식 DB를 확인하지 못했습니다. DB 마이그레이션과 연결을 확인해 주세요.", 503);
  if ((notesResult.data?.length ?? 0) > 40 || (artifacts.data?.length ?? 0) > 1500 || (progressResult.data?.length ?? 0) > 100) throw new RequestError("과목 분석 범위를 초과했습니다. 자료·수업 범위를 나누어 주세요.", 409);
  const notes = (notesResult.data ?? []).filter((n) => /\.pdf$/i.test(n.file_name ?? "") || n.drive_file_id || n.file_path?.toLowerCase().endsWith(".pdf")) as KnowledgeNote[];
  const progress = (progressResult.data ?? []) as Progress[];
  const plan = await planKnowledge(notes, progress, (artifacts.data ?? []) as KnowledgeTask[], model, searchModel);
  return { goal: goal.data, notes, progress, plan, context: { goal_id: goalId, ...knowledgeContext(plan) } };
}

export function knowledgeModels(env: (key: string) => string | undefined, settings?: CoachingSettings) {
  const model = env("COURSE_KNOWLEDGE_MODEL") ?? settings?.analysis_model ?? env("NOTE_ANALYSIS_MODEL") ?? env("COACHING_MODEL");
  if (!model) throw new RequestError("과목 분석 모델 설정이 필요합니다.", 503);
  return { model, searchModel: featureEnabled(env("COURSE_RESEARCH_ENABLED"), settings?.research_enabled ?? false)
    ? env("COURSE_RESEARCH_MODEL") ?? settings?.research_model ?? null : null };
}

export function publicKnowledgeStatus(loaded: Awaited<ReturnType<typeof loadKnowledge>>) {
  const { plan } = loaded;
  const pdfTasks = plan.tasks.filter((t) => t.kind !== "research");
  return { goal_id: loaded.goal.id, title: loaded.goal.title,
    sources: loaded.notes.map(({ id, title }) => ({ id, title })),
    status: pdfTasks.some((t) => t.status === "failed") ? "failed" : pdfTasks.length ? "processing" : "ready",
    pdf_count: plan.pdf_count, pdf_ready: plan.pdf_ready, overview_complete: plan.overview_complete, detail_complete: plan.detail_complete,
    research_status: plan.research_status, pending_steps: plan.tasks.length,
    failed_steps: plan.tasks.filter((t) => t.status === "failed").map((t) => ({ id: t.id, kind: t.kind, message: t.error_message })),
    syllabus_detected: plan.active.some((t) => t.kind === "overview" && ((t.payload?.extraction as { syllabus?: unknown[] })?.syllabus?.length ?? 0) > 0),
    warnings: plan.warnings, actual_progress: plan.actual_progress,
    knowledge: loaded.context,
  };
}
