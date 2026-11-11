import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.116.0";
import { CoachingError, type CoachingContext, type CoachingRequest } from "./contract.ts";

type Candidate = { goal_id: string; title: string; target_date: string | null;
  events: { id: string; title: string; event_type: string; at: string }[] };
export type RelatedLearning = { observation_id: string; goal_id: string; topic_id: string; topic_title: string;
  self_rating: number | null; learning_status: string; observed_at: string };
export type CoachingReview = { status: "not_requested" | "ready"; truncated: boolean;
  candidates: Candidate[]; related_learning: RelatedLearning[] };

const object = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
export function requirementUnits(context: CoachingContext, goalId: string) {
  return (context.course_knowledge ?? []).filter(k => k.goal_id === goalId).flatMap(k =>
    (Array.isArray(k.content) ? k.content : []).flatMap(raw => {
      const artifact = object(raw), content = object(artifact.content);
      return (Array.isArray(content.units) ? content.units : []).map(rawUnit => {
        const u = object(rawUnit);
        return { ref: String(u.unit_ref ?? artifact.artifact_id ?? ""), title: String(u.title ?? "").slice(0, 200),
          prerequisites: (Array.isArray(u.prerequisites) ? u.prerequisites : []).filter((v): v is string => typeof v === "string").slice(0, 6) };
      });
    })).slice(0, 30);
}

export async function loadCoachingReview(db: SupabaseClient, userId: string, request: CoachingRequest, context: CoachingContext): Promise<CoachingReview> {
  const result: CoachingReview = { status: "not_requested", truncated: false, candidates: [], related_learning: [] };
  if (!request.review_other_goals && !request.use_related_learning) return result;
  result.status = "ready";
  if (request.review_other_goals && request.intent !== "daily_plan") {
    const goals = await db.from("learning_goals").select("id,title,target_date").eq("user_id", userId)
      .eq("status", "active").order("target_date", { ascending: true, nullsFirst: false }).order("id").limit(101);
    if (goals.error) throw new CoachingError("다른 목표의 검토 범위를 확인하지 못했습니다.", 503);
    result.truncated = (goals.data?.length ?? 0) > 100;
    const other = (goals.data ?? []).slice(0, 100).filter(g => !request.goal_ids.includes(g.id));
    if (other.length) {
      const events = await db.from("calendar_events").select("id,goal_id,title,event_type,due_at,starts_at")
        .eq("user_id", userId).eq("status", "scheduled").in("goal_id", other.map(g => g.id)).order("id").limit(201);
      if (events.error) throw new CoachingError("시험·과제 검토 후보를 확인하지 못했습니다.", 503);
      result.truncated ||= (events.data?.length ?? 0) > 200;
      const until = request.preparation_end ?? request.period_end;
      const localDay = (at: string) => {
        const parts = new Intl.DateTimeFormat("en-CA", { timeZone: context.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(at));
        return ["year", "month", "day"].map(type => parts.find(p => p.type === type)!.value).join("-");
      };
      for (const g of other) {
        const relevant = (events.data ?? []).slice(0, 200).filter(e => e.goal_id === g.id && ["exam", "assignment", "quiz", "project"].includes(e.event_type))
          .map(e => ({ id: e.id, title: e.title.slice(0, 200), event_type: e.event_type, at: e.due_at ?? e.starts_at }))
          .filter((e): e is typeof e & { at: string } => Boolean(e.at) && localDay(e.at!) >= request.period_start && localDay(e.at!) <= until);
        if (relevant.length || (g.target_date && g.target_date >= request.period_start && g.target_date <= until)) {
          result.candidates.push({ goal_id: g.id, title: g.title.slice(0, 200), target_date: g.target_date, events: relevant.slice(0, 5) });
        }
      }
      result.truncated ||= result.candidates.length > 10;
      result.candidates = result.candidates.slice(0, 10);
    }
  }
  if (request.use_related_learning) {
    const terms = [...new Set(context.goals.flatMap(g => requirementUnits(context, g.id).flatMap(u => u.prerequisites))
      .map(v => v.toLowerCase().trim()).filter(v => v.length >= 2))].slice(0, 30);
    if (terms.length) {
      const topics = await db.from("goal_topics").select("id,goal_id,title").eq("user_id", userId).eq("status", "confirmed").order("updated_at", { ascending: false }).order("id").limit(201);
      if (topics.error) throw new CoachingError("선수 학습 근거를 확인하지 못했습니다.", 503);
      result.truncated ||= (topics.data?.length ?? 0) > 200;
      const matches = (topics.data ?? []).slice(0, 200).filter(t => !request.goal_ids.includes(t.goal_id) && terms.some(term =>
        t.title.toLowerCase().includes(term) || term.includes(t.title.toLowerCase().trim()) && t.title.trim().length >= 2)).slice(0, 12);
      if (matches.length) {
        const states = await db.from("topic_learning_states").select("id,goal_id,topic_id,self_rating,learning_status,observed_at")
          .eq("user_id", userId).in("topic_id", matches.map(t => t.id)).limit(13);
        if (states.error) throw new CoachingError("선수 학습 관측을 확인하지 못했습니다.", 503);
        result.related_learning = (states.data ?? []).slice(0, 12).flatMap(s => {
          const t = matches.find(t => t.id === s.topic_id && t.goal_id === s.goal_id);
          return t ? [{ observation_id: s.id, goal_id: s.goal_id, topic_id: s.topic_id, topic_title: t.title.slice(0, 200),
            self_rating: s.self_rating, learning_status: s.learning_status, observed_at: s.observed_at }] : [];
        });
      }
    }
  }
  return result;
}

export function evidenceIds(context: CoachingContext, goalId?: string): Set<string> {
  const ids = new Set<string>();
  const add = (v: unknown) => { if (typeof v === "string" && v) ids.add(v); };
  for (const row of [...context.topics, ...context.deadlines, ...context.sessions, ...(context.topic_learning_states ?? []), ...(context.topic_check_states ?? [])]) if (!goalId || row.goal_id === goalId) add(row.id);
  for (const row of context.problem_bank?.records ?? []) if (!goalId || row.goal_id === goalId) add(row.id);
  for (const row of context.understanding_history?.records ?? []) if (!goalId || row.goal_id === goalId) add(row.id);
  for (const g of context.goals.filter(g => !goalId || g.id === goalId)) for (const u of requirementUnits(context, g.id)) add(u.ref);
  for (const k of (context.course_knowledge ?? []).filter(k => !goalId || k.goal_id === goalId)) for (const raw of [...(Array.isArray(k.content) ? k.content : []), ...(Array.isArray(k.research) ? k.research : [])]) add(object(raw).artifact_id);
  for (const r of context.review?.related_learning ?? []) add(r.observation_id);
  for (const g of context.review?.candidates ?? []) if (!goalId || g.goal_id === goalId) for (const e of g.events) add(e.id);
  return ids;
}
